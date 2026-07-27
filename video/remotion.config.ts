/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import path from "node:path";

const projectRoot = process.cwd();
const assetRoot = path.resolve(
  projectRoot,
  process.env.VIDEO_ASSETS_DIR || "../../video-assets",
);

Config.setPublicDir(path.join(assetRoot, "render-inputs"));
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(100);
Config.setColorSpace("bt709");
Config.setOverwriteOutput(true);
