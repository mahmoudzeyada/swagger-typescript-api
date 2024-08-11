import * as lodash from "lodash";
import { MonoSchemaParser } from "../mono-schema-parser.js";

// T1 & T2
class AllOfSchemaParser extends MonoSchemaParser {
  parse() {
    const ignoreTypes = [this.config.Ts.Keyword.Any];
    const combined = lodash.map(this.schema.allOf, (childSchema) =>
      this.schemaParserFabric.getInlineParseContent(
        this.schemaUtils.makeAddRequiredToChildSchema(this.schema, childSchema),
        null,
        this.schemaPath,
      ),
    );
    const filtered = this.schemaUtils.filterSchemaContents(
      combined,
      (content) => !ignoreTypes.includes(content),
    );

    const type = this.config.Ts.IntersectionType(filtered);

    return this.schemaUtils.safeAddNullToType(this.schema, type);
  }
}

export { AllOfSchemaParser };
