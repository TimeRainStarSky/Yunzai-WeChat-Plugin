import fs from "node:fs"
import YAML from "yaml"
import _ from "lodash"

const configFile = "config/WeChat.yaml"
const configSave = config => fs.writeFileSync(configFile, YAML.stringify({ ...config, package: undefined }), "utf-8")

const configFileOld = "plugins/WeChat-Plugin/config.yaml"
if (fs.existsSync(configFileOld))
  fs.renameSync(configFileOld, configFile)

const config = {
  tips: "",
  permission: "master",
  expireTime: 10,
  id: []
}

let configData

if (fs.existsSync(configFile))
  try {
    configData = YAML.parse(fs.readFileSync(configFile, "utf-8"))
    _.merge(config, configData)
  } catch (err) {
    logger.error(`配置文件 读取失败：${logger.red(err)}`)
  }

config.tips = [
  "欢迎使用 TRSS-Yunzai WeChat Plugin ! 作者：时雨🌌星空",
  "参考：https://github.com/TimeRainStarSky/Yunzai-WeChat-Plugin"
]

if (YAML.stringify(config) != YAML.stringify(configData))
  configSave(config)

config.package = JSON.parse(fs.readFileSync("plugins/WeChat-Plugin/package.json", "utf-8"))

export { config, configSave }