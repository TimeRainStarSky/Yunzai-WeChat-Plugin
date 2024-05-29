logger.info(logger.yellow("- 正在加载 微信 适配器插件"))

import makeConfig from "../../lib/plugins/config.js"
import fetch from "node-fetch"
import fs from "node:fs"
import path from "node:path"
import Wechat from "wechat4u"

const { config, configSave } = await makeConfig("WeChat", {
  tips: "",
  permission: "master",
  expireTime: 10,
  id: [],
}, {
  tips: [
    "欢迎使用 TRSS-Yunzai WeChat Plugin ! 作者：时雨🌌星空",
    "参考：https://github.com/TimeRainStarSky/Yunzai-WeChat-Plugin",
  ],
})

const adapter = new class WeChatAdapter {
  id = "WeChat"
  name = "微信Bot"
  version = `wechat4u v0.7.14`
  path = "data/WeChat/"
  error = {}

  makeParams(data) {
    const params = []
    for (const i of Object.keys(data))
      params.push(`${encodeURIComponent(i)}=${encodeURIComponent(data[i])}`)
    return `?${params.join("&")}`
  }

  async sendMsg(data, id, msg) {
    if (!Array.isArray(msg))
      msg = [msg]
    const msgs = []
    const message_id = []
    let quote
    let at
    for (let i of msg) {
      if (typeof i != "object")
        i = { type: "text", text: i }

      let ret
      let file
      if (i.file) {
        file = await Bot.fileType(i)
        ret = await data.bot.sendMsg({ file: file.buffer, filename: file.name }, id)
      }

      switch (i.type) {
        case "text":
          Bot.makeLog("info", `发送文本：[${id}] ${i.text}`, data.self_id)
          ret = await data.bot.sendMsg(i.text, id)
          break
        case "image":
          Bot.makeLog("info", `发送图片：[${id}] ${file.name}(${file.url} ${(file.buffer.length/1024).toFixed(2)}KB)`, data.self_id)
          break
        case "record":
          Bot.makeLog("info", `发送音频：[${id}] ${file.name}(${file.url} ${(file.buffer.length/1024).toFixed(2)}KB)`, data.self_id)
          break
        case "video":
          Bot.makeLog("info", `发送视频：[${id}] ${file.name}(${file.url} ${(file.buffer.length/1024).toFixed(2)}KB)`, data.self_id)
          break
        case "reply":
        case "at":
        case "button":
          break
        case "node":
          for (const ret of (await Bot.sendForwardMsg(msg => this.sendMsg(data, id, msg), i.data))) {
            msgs.push(...ret.data)
            message_id.push(...ret.message_id)
          }
          break
        default:
          i = JSON.stringify(i)
          Bot.makeLog("info", `发送消息：[${id}] ${i}`, data.self_id)
          ret = await data.bot.sendMsg(i, id)
      }
      if (ret) {
        msgs.push(ret)
        if (ret.MsgID)
          message_id.push(ret.MsgID)
      }
    }
    return { data: msgs, message_id }
  }

  async recallMsg(data, id, message_id) {
    Bot.makeLog("info", `撤回消息：[${id}] ${message_id}`, data.self_id)
    if (!Array.isArray(message_id))
      message_id = [message_id]
    const msgs = []
    for (const i of message_id)
      msgs.push(await data.bot.revokeMsg(i, id))
    return msgs
  }

  getFriendInfo(id, user_id) {
    const i = Bot[id].contacts[user_id]
    if (!i) return false

    return {
      ...i,
      user_id: `wx_${i.UserName}`,
      nickname: i.NickName,
      avatar: `${Bot[id].CONF.origin}${i.HeadImgUrl}`,
    }
  }

  getFriendArray(id) {
    const array = []
    for (const i of Object.keys(Bot[id].contacts).filter(i => !i.startsWith("@@")))
      array.push(this.getFriendInfo(id, i))
    return array
  }

  getFriendList(id) {
    const array = []
    for (const { user_id } of this.getFriendArray(id))
      array.push(user_id)
    return array
  }

  getFriendMap(id) {
    const map = new Map
    for (const i of this.getFriendArray(id))
      map.set(i.user_id, i)
    return map
  }

  getMemberArray(data) {
    const array = []
    for (const i of data.MemberList)
      array.push({
        ...data.bot.fl.get(`wx_${i.UserName}`),
        ...i,
        user_id: `wx_${i.UserName}`,
        nickname: i.NickName,
      })
    return array
  }

  getMemberList(data) {
    const array = []
    for (const { user_id } of this.getMemberArray(data))
      array.push(user_id)
    return array
  }

  getMemberMap(data) {
    const map = new Map
    for (const i of this.getMemberArray(data))
      map.set(i.user_id, i)
    return map
  }

  getGroupInfo(id, group_id) {
    const i = Bot[id].contacts[group_id]
    if (!i) return false

    return {
      ...i,
      group_id: `wx_${i.UserName}`,
      group_name: i.NickName,
      avatar: `${Bot[id].CONF.origin}${i.HeadImgUrl}`,
    }
  }

  getGroupArray(id) {
    const array = []
    for (const i of Object.keys(Bot[id].contacts).filter(i => i.startsWith("@@")))
      array.push(this.getGroupInfo(id, i))
    return array
  }

  getGroupList(id) {
    const array = []
    for (const { group_id } of this.getGroupArray(id))
      array.push(group_id)
    return array
  }

  getGroupMap(id) {
    const map = new Map
    for (const i of this.getGroupArray(id))
      map.set(i.group_id, i)
    return map
  }

  getGroupMemberMap(id) {
    const map = new Map
    for (const i of this.getGroupList(id))
      map.set(i, new Map)
    return map
  }

  pickFriend(id, user_id) {
    const i = {
      ...Bot[id].fl.get(user_id),
      self_id: id,
      bot: Bot[id],
      user_id: user_id.replace(/^wx_/, ""),
    }
    return {
      ...i,
      sendMsg: msg => this.sendMsg(i, i.user_id, msg),
      recallMsg: message_id => this.recallMsg(i, i.user_id, message_id),
      getInfo: () => i,
      getAvatarUrl: () => i.avatar,
    }
  }

  pickMember(id, group_id, user_id) {
    const i = {
      ...Bot[id].fl.get(user_id),
      self_id: id,
      bot: Bot[id],
      group_id: group_id.replace(/^wx_/, ""),
      user_id: user_id.replace(/^wx_/, ""),
    }
    return {
      ...this.pickFriend(id, user_id),
      ...i,
      getInfo: () => this.pickGroup(id, group_id).getMemberMap().get(user_id),
    }
  }

  pickGroup(id, group_id) {
    const i = {
      ...Bot[id].gl.get(group_id),
      self_id: id,
      bot: Bot[id],
      group_id: group_id.replace(/^wx_/, ""),
    }
    return {
      ...i,
      sendMsg: msg => this.sendMsg(i, i.group_id, msg),
      recallMsg: message_id => this.recallMsg(i, i.group_id, message_id),
      getMemberArray: () => this.getMemberArray(i),
      getMemberList: () => this.getMemberList(i),
      getMemberMap: () => this.getMemberMap(i),
      pickMember: user_id => this.pickMember(id, group_id, user_id),
      getInfo: () => i,
      getAvatarUrl: () => i.avatar,
    }
  }

  makeMessage(data) {
    if (data.CreateTime + config.expireTime < Date.now()/1000) return

    data.bot = Bot[data.self_id]
    data.post_type = "message"
    if (data.isSendBySelf) {
      if (data.FromUserName == data.ToUserName) {
        data.message_type = "private"
      } else {
        data.message_type = "group"
        data.group_id = `wx_${data.ToUserName}`
      }

      data.user_id = `wx_${data.FromUserName}`
      data.sender = {
        ...data.bot.info,
        user_id: data.bot.uin,
        nickname: data.bot.nickname,
        avatar: data.bot.avatar,
      }

      data.content = data.Content
      data.raw_content = data.OriginalContent
    } else if (data.FromUserName.startsWith("@@")) {
      data.message_type = "group"
      data.group_id = `wx_${data.FromUserName}`

      data.content = data.Content.split(":")
      data.raw_content = data.OriginalContent.split(":")

      data.user_id = `wx_${data.raw_content.shift()}`
      data.sender = {
        ...data.bot.fl.get(data.user_id),
        user_id: data.user_id,
        nickname: data.content.shift(),
      }

      data.content = data.content.join(":").replace(/^\n/, "")
      data.raw_content = data.raw_content.join(":").replace(/^<br\/>/, "")
    } else {
      data.message_type = "private"
      data.user_id = `wx_${data.FromUserName}`
      data.sender = data.bot.fl.get(data.user_id) || {}

      data.content = data.Content
      data.raw_content = data.OriginalContent
    }
    data.message_id = data.MsgId

    data.message = []
    data.raw_message = ""

    switch (data.MsgType) {
      case data.bot.CONF.MSGTYPE_TEXT:
        data.message.push({ type: "text", text: data.content })
        data.raw_message += data.content
        break
      case data.bot.CONF.MSGTYPE_IMAGE:
        data.content = `${data.bot.CONF.API_webwxgetmsgimg}${this.makeParams({
          MsgID: data.MsgId,
          skey: data.bot.PROP.skey,
          type: "big",
        })}`
        data.message.push({ type: "image", url: data.content })
        data.raw_message += `[图片：${data.content}]`
        break
      case data.bot.CONF.MSGTYPE_VOICE:
        data.content = `${data.bot.CONF.API_webwxgetvoice}${this.makeParams({
          MsgID: data.MsgId,
          skey: data.bot.PROP.skey,
        })}`
        data.message.push({ type: "record", url: data.content })
        data.raw_message += `[音频：${data.content}]`
        break
      case data.bot.CONF.MSGTYPE_EMOTICON:
        data.content = `${data.bot.CONF.API_webwxgetmsgimg}${this.makeParams({
          MsgID: data.MsgId,
          skey: data.bot.PROP.skey,
          type: "big",
        })}`
        data.message.push({ type: "image", url: data.content })
        data.raw_message += `[表情：${data.content}]`
        break
      case data.bot.CONF.MSGTYPE_MICROVIDEO:
        data.content = `${data.bot.CONF.API_webwxgetvideo}${this.makeParams({
          MsgID: data.MsgId,
          skey: data.bot.PROP.skey,
        })}`
        data.message.push({ type: "video", url: data.content })
        data.raw_message += `[小视频：${data.content}]`
        break
      case data.bot.CONF.MSGTYPE_VIDEO:
        data.content = `${data.bot.CONF.API_webwxgetvideo}${this.makeParams({
          MsgID: data.MsgId,
          skey: data.bot.PROP.skey,
        })}`
        data.message.push({ type: "video", url: data.content })
        data.raw_message += `[视频：${data.content}]`
        break
      case data.bot.CONF.MSGTYPE_APP:
        switch (data.AppMsgType) {
          case data.bot.CONF.APPMSGTYPE_ATTACH:
            data.content = `${data.bot.CONF.API_webwxdownloadmedia}${this.makeParams({
              sender: data.FromUserName,
              mediaid: data.MediaId,
              filename: data.FileName,
              fromuser: data.bot.user.UserName,
              pass_ticket: data.bot.PROP.passTicket,
              webwx_data_ticket: data.bot.PROP.webwxDataTicket
            })}`
            data.message.push({ type: "file", url: data.content })
            data.raw_message += `[文件：${data.content}]`
            break
          default:
            data.message.push({ type: "text", text: data.content })
            data.raw_message += data.content
        }
        break
      default:
        data.message.push({ type: "text", text: data.content })
        data.raw_message += data.content
    }

    if (data.group_id) {
      data.group = data.bot.pickGroup(data.group_id)
      data.group_name = data.group.group_name
      Bot.makeLog("info", `群消息：[${data.group_name}(${data.group_id}), ${data.sender.nickname}(${data.user_id})] ${data.raw_message}`, data.self_id)
    } else {
      Bot.makeLog("info", `好友消息：[${data.sender.nickname}(${data.user_id})] ${data.raw_message}`, data.self_id)
    }

    Bot.em(`${data.post_type}.${data.message_type}`, data)
  }

  async errorLog(bot, error) {
    const name = `${error.name}-${error.message}-${error.code}-${error.tips}`
    const time = Date.now()
    if (this.error[name]?.time && time - this.error[name].time < 15000)
      return false
    this.error[name] = { time, error }
    Bot.makeLog("error", error, bot.user?.Uin)
  }

  async qrLogin(send) {
    const bot = new Wechat
    bot.on("error", error => this.errorLog(bot, error))
    bot.on("uuid", uuid => {
      const url = `https://login.weixin.qq.com/qrcode/${uuid}`
      logger.mark(`微信扫码登录：${logger.green(url)}`)
      send([`请使用微信扫码登录：${url}`, segment.image(url)])
    })

    return new Promise(resolve => {
      bot.once("login", () => resolve(bot))
      bot.once("logout", () => resolve(false))
      bot.start()
    })
  }

  async dataLogin(id) {
    if (!fs.existsSync(`${this.path}${id}.json`))
      return false

    const bot = new Wechat(JSON.parse(fs.readFileSync(`${this.path}${id}.json`)))
    bot.on("error", error => this.errorLog(bot, error))

    return new Promise(resolve => {
      bot.once("login", () => resolve(bot))
      bot.once("logout", () => resolve(false))
      bot.restart()
    })
  }

  async connect(id) {
    let bot
    if (typeof id == "function") {
      bot = await this.qrLogin(id)
    } else {
      bot = await this.dataLogin(id)
    }

    if (!bot?.user?.Uin) {
      Bot.makeLog("error", `${this.name}(${this.id}) ${this.version} 连接失败`, id)
      return false
    }

    id = `wx_${bot.user.Uin}`
    fs.writeFileSync(`${this.path}${id}.json`, JSON.stringify(bot.botData))

    Bot[id] = bot
    Bot[id].adapter = this
    Bot[id].info = Bot[id].user
    Bot[id].uin = id
    Bot[id].nickname = Bot[id].info.NickName
    Bot[id].avatar = `${Bot[id].CONF.origin}${Bot[id].info.HeadImgUrl}`
    Bot[id].version = {
      id: this.id,
      name: this.name,
      version: this.version,
    }
    Bot[id].stat = { start_time: Date.now()/1000 }

    Bot[id].pickFriend = user_id => this.pickFriend(id, user_id)
    Bot[id].pickUser = Bot[id].pickFriend

    Bot[id].getFriendArray = () => this.getFriendArray(id)
    Bot[id].getFriendList = () => this.getFriendList(id)
    Bot[id].getFriendMap = () => this.getFriendMap(id)

    Bot[id].pickMember = (group_id, user_id) => this.pickMember(id, group_id, user_id)
    Bot[id].pickGroup = group_id => this.pickGroup(id, group_id)

    Bot[id].getGroupArray = () => this.getGroupArray(id)
    Bot[id].getGroupList = () => this.getGroupList(id)
    Bot[id].getGroupMap = () => this.getGroupMap(id)
    Bot[id].getGroupMemberMap = () => this.getGroupMemberMap(id)

    Object.defineProperty(Bot[id], "fl", { get() { return this.getFriendMap() }})
    Object.defineProperty(Bot[id], "gl", { get() { return this.getGroupMap() }})
    Object.defineProperty(Bot[id], "gml", { get() { return this.getGroupMemberMap() }})

    if (!config.id.includes(id)) {
      config.id.push(id)
      await configSave()
    }

    Bot[id].on("message", data => {
      data.self_id = id
      this.makeMessage(data)
    })

    Bot.makeLog("mark", `${this.name}(${this.id}) ${this.version} 已连接`, id)
    Bot.em(`connect.${id}`, { self_id: id })
    return id
  }

  async load() {
    await Bot.mkdir(this.path)
    for (const id of config.id)
      await Bot.sleep(5000, this.connect(id))
  }
}

Bot.adapter.push(adapter)

export class WeChat extends plugin {
  constructor() {
    super({
      name: "WeChatAdapter",
      dsc: "微信 适配器设置",
      event: "message",
      rule: [
        {
          reg: "^#(微信|WeChat)账号$",
          fnc: "List",
          permission: config.permission,
        },
        {
          reg: "^#(微信|WeChat)登录$",
          fnc: "Login",
          permission: config.permission,
        },
        {
          reg: "^#(微信|WeChat)删除.+$",
          fnc: "Remove",
          permission: config.permission,
        }
      ]
    })
  }

  List() {
    this.reply(`共${config.id.length}个账号：\n${config.id.join("\n")}`, true)
  }

  async Login() {
    if (await adapter.connect(msg => this.reply(msg, true))) {
      this.reply(`账号已连接，共${config.id.length}个账号`, true)
    } else {
      this.reply(`账号连接失败`, true)
      return false
    }
  }

  async Remove() {
    const id = this.e.msg.replace(/^#(微信|WeChat)删除/, "").trim()
    if (!config.id.includes(id)) {
      this.reply(`账号不存在：${id}`, true)
      return false
    }

    config.id = config.id.filter(item => item != id)
    this.reply(`账号已删除，重启后生效，共${config.id.length}个账号`, true)
    await configSave()
  }
}

logger.info(logger.green("- 微信 适配器插件 加载完成"))