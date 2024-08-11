import { resolve } from "node:path";
import * as path from "node:path";
import * as url from "node:url";
import * as Eta from "eta";
import * as lodash from "lodash";

class TemplatesWorker {
  /**
   * @type {CodeGenConfig}
   */
  config;

  /**
   * @type {Logger}
   */
  logger;

  /**
   * @type {FileSystem}
   */
  fileSystem;

  getRenderTemplateData;

  constructor({ config, logger, fileSystem, getRenderTemplateData }) {
    this.config = config;
    this.logger = logger;
    this.fileSystem = fileSystem;
    this.getRenderTemplateData = getRenderTemplateData;
  }

  /**
   *
   * @param config {CodeGenConfig}
   * @returns {CodeGenConfig.templatePaths}
   */
  getTemplatePaths = (config) => {
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const baseTemplatesPath = resolve(__dirname, "../templates/base");
    const defaultTemplatesPath = resolve(__dirname, "../templates/default");
    const modularTemplatesPath = resolve(__dirname, "../templates/modular");
    const originalTemplatesPath = config.modular
      ? modularTemplatesPath
      : defaultTemplatesPath;
    const customTemplatesPath =
      (config.templates && resolve(process.cwd(), config.templates)) || null;

    return {
      /** `templates/base` */
      base: baseTemplatesPath,
      /** `templates/default` */
      default: defaultTemplatesPath,
      /** `templates/modular` */
      modular: modularTemplatesPath,
      /** usage path if `--templates` option is not set */
      original: originalTemplatesPath,
      /** custom path to templates (`--templates`) */
      custom: customTemplatesPath,
    };
  };

  cropExtension = (path) =>
    this.config.templateExtensions.reduce(
      (path, ext) =>
        lodash.endsWith(path, ext) ? path.replace(ext, "") : path,
      path,
    );

  getTemplateFullPath = (path, fileName) => {
    const raw = resolve(path, "./", this.cropExtension(fileName));
    const pathVariants = this.config.templateExtensions.map(
      (extension) => `${raw}${extension}`,
    );

    return pathVariants.find(
      (variant) => !!this.fileSystem.pathIsExist(variant),
    );
  };

  requireFnFromTemplate = async (packageOrPath) => {
    const isPath =
      lodash.startsWith(packageOrPath, "./") ||
      lodash.startsWith(packageOrPath, "../");

    if (isPath) {
      return await import(
        path.resolve(
          this.config.templatePaths.custom ||
            this.config.templatePaths.original,
          packageOrPath,
        )
      );
    }

    return await import(packageOrPath);
  };

  getTemplate = ({ fileName, name, path }) => {
    const { templatePaths } = this.config;

    if (path) {
      return this.fileSystem.getFileContent(path);
    }

    if (!fileName) return "";

    const customFullPath =
      templatePaths.custom &&
      this.getTemplateFullPath(templatePaths.custom, fileName);
    let fileContent =
      customFullPath && this.fileSystem.getFileContent(customFullPath);

    if (fileContent) {
      this.logger.log(
        `"${lodash.lowerCase(name)}" template found in "${templatePaths.custom}"`,
      );
      return fileContent;
    }

    const baseFullPath = this.getTemplateFullPath(templatePaths.base, fileName);

    if (baseFullPath) {
      fileContent = this.fileSystem.getFileContent(baseFullPath);
    } else {
      if (templatePaths.custom) {
        this.logger.warn(
          `"${lodash.lowerCase(name)}" template not found in "${
            templatePaths.custom
          }"`,
          "\nCode generator will use the default template",
        );
      } else {
        this.logger.log(
          `Code generator will use the default template for "${lodash.lowerCase(
            name,
          )}"`,
        );
      }
    }

    const originalFullPath = this.getTemplateFullPath(
      templatePaths.original,
      fileName,
    );

    if (originalFullPath) {
      fileContent = this.fileSystem.getFileContent(originalFullPath);
    }

    return fileContent;
  };

  getTemplates = ({ templatePaths }) => {
    if (templatePaths.custom) {
      this.logger.log(
        `try to read templates from directory "${templatePaths.custom}"`,
      );
    }

    return lodash.reduce(
      this.config.templateInfos,
      (acc, { fileName, name }) => ({
        ...acc,
        [name]: this.getTemplate({ fileName, name }),
      }),
      {},
    );
  };

  findTemplateWithExt = (path) => {
    const raw = this.cropExtension(path);
    const pathVariants = this.config.templateExtensions.map(
      (extension) => `${raw}${extension}`,
    );
    return pathVariants.find((variant) => this.fileSystem.pathIsExist(variant));
  };

  getTemplateContent = (path) => {
    const foundTemplatePathKey = lodash
      .keys(this.config.templatePaths)
      .find((key) => lodash.startsWith(path, `@${key}`));

    const rawPath = resolve(
      lodash.replace(
        path,
        `@${foundTemplatePathKey}`,
        this.config.templatePaths[foundTemplatePathKey],
      ),
    );
    const fixedPath = this.findTemplateWithExt(rawPath);

    if (fixedPath) {
      return this.fileSystem.getFileContent(fixedPath);
    }

    const customPath =
      this.config.templatePaths.custom &&
      this.findTemplateWithExt(resolve(this.config.templatePaths.custom, path));

    if (customPath) {
      return this.fileSystem.getFileContent(customPath);
    }

    const originalPath = this.findTemplateWithExt(
      resolve(this.config.templatePaths.original, path),
    );

    if (originalPath) {
      return this.fileSystem.getFileContent(originalPath);
    }

    return "";
  };

  /**
   * @param template
   * @param configuration
   * @param options
   * @returns {Promise<string|string|void>}
   */
  renderTemplate = (template, configuration, options) => {
    if (!template) return "";

    return Eta.render(
      template,
      {
        ...this.getRenderTemplateData(),
        ...configuration,
      },
      {
        async: false,
        ...(options || {}),
        includeFile: (path, configuration, options) => {
          return this.renderTemplate(
            this.getTemplateContent(path),
            configuration,
            options,
          );
        },
      },
    );
  };
}

export { TemplatesWorker };
