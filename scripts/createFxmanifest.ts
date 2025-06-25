// fxmanifest.ts
import { writeFileSync } from "fs";
import path from "path";

const exampleFxmanifest = `fx_version 'cerulean'
game 'gta5'
author 'Eterna <rPumba@outlook.de>'
description 'Eterna Core'
version '1.0.0'
node_version '22'
license 'APGL-3.0-only'
repository 'https://github.com/Eterna-Community/Eterna-Core'

client_scripts {
    '{PATH_TO_CLIENT}'
}

server_scripts {
    '{PATH_TO_SERVER}'
}

ui_page '{PATH_TO_INDEX_HTML}'

files {
{PATH_TO_FILES}
}
`;

export interface FxmanifestConfig {
  pathToClient: string;
  pathToServer: string;
  pathToIndexHtml: string;
  pathToFiles: string[];
  outputPath?: string;
}

export const createFxmanifest = (config: FxmanifestConfig): string => {
  const sanitizePath = (path: string): string => path.replace(/\\/g, "/");
  // Files Array formatieren
  const filesContent = config.pathToFiles
    .map((file) => `    '${sanitizePath(file)}'`)
    .join(",\n");

  return exampleFxmanifest
    .replace("{PATH_TO_CLIENT}", config.pathToClient)
    .replace("{PATH_TO_SERVER}", config.pathToServer)
    .replace("{PATH_TO_INDEX_HTML}", sanitizePath(config.pathToIndexHtml))
    .replace("{PATH_TO_FILES}", filesContent);
};

export const writeFxmanifest = (config: FxmanifestConfig): void => {
  const content = createFxmanifest(config);
  const outputPath = config.outputPath || path.join("dist", "fxmanifest.lua");

  writeFileSync(outputPath, content, "utf8");
};
