// GPS 시뮬레이션용 샘플 GPX 파일을 에셋으로 번들하기 위해 확장자를 추가한다.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('gpx');

module.exports = config;
