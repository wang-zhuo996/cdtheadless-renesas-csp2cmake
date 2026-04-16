const ejs = require("ejs");
const cli_parser_rules = require("./cli_command_format.json");

class RenesasCliOption {
  constructor(data) {
    this.description = data.description;
    this.type = data.type;
    this.required = data.required;
    this.minVersion = data.minVersion;
    this.args = data.args;
    this.format = data.format;
    this.PEonly = data.PEonly;
    this.maxVersion = data.maxVersion;
    this.switch = data.switch;
    this.args_valid = data.args_valid;
    this.args_list_join = data.args_list_join;
    // this.compiledFormatString();
    this.input_args = [];

    try {
      this.compiled_format = ejs.compile(this.format);
    } catch (error) {
      this.compiled_format = false;
    }
    try {
      this.compiled_switch = ejs.compile(this.switch);
    } catch (error) {
      this.compiled_switch = false;
    }
  }

  input(arg, value) {
    if (this.args.include(arg)) this.input_args.push({ arg, value });
    else throw new Error("Invalid argument");
  }

  switchCheck() {
    if (this.compiled_switch)
      return eval(this.compiled_switch(this.input_args));
  }
}

class RenesasCliMaker {
  constructor(rules) {
    this.options = new Map(
      Object.entries(rules).map(([key, value]) => [
        key,
        new RenesasCliOption(value),
      ]),
    );
  }
  set(cli_name, option_value) {
    const option = this.get(cli_name);
    Object.entries(option_value).forEach(([key, value]) =>
      option.input(key, value),
    );
  }
  get(cli_name) {
    return this.options.get(cli_name);
  }
}

const cli_maker = {
  C编译选项: new RenesasCliMaker(cli_parser_rules.CompileOptions),
  Asm编译选项: new RenesasCliMaker(cli_parser_rules.CompileOptions),
  链接选项: new RenesasCliMaker(cli_parser_rules.LinkOptions),
  输出选项: new RenesasCliMaker(cli_parser_rules.HexoutputOptions),
  Lib选项: new RenesasCliMaker(cli_parser_rules.LinkOptions),
};

module.exports = {
  cli_maker,
};
