// Copyright (c)2023 Quinn Michaels
// OpenAI Deva
// used for connecting into open ai services for cht and images.

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { Configuration, OpenAIApi } = require("openai");

const package = require('./package.json');
const info = {
  id: package.id,
  name: package.name,
  describe: package.description,
  version: package.version,
  url: package.homepage,
  git: package.repository.url,
  bugs: package.bugs.url,
  author: package.author,
  license: package.license,
  copyright: package.copyright,
};

const data_path = path.join(__dirname, 'data.json');
const {agent,vars} = require(data_path).data;


const Deva = require('@indra.ai/deva');
const OPEN = new Deva({
  info,
  agent: {
    uid: agent.uid,
    key: agent.key,
    name: agent.name,
    describe: agent.describe,
    prompt: agent.prompt,
    voice: agent.voice,
    profile: agent.profile,
    translate(input) {
      return input.trim();
    },
    parse(input) {
      return input.trim().replace(/\n\n(\D)/g, "\n\np: $1");
    }
  },
  vars,
  listeners: {},
  modules: {
    openai: false,
  },
  devas: {},
  func: {
    chat(packet) {
      return new Promise((resolve, reject) => {
        if (!packet.q.text) return resolve(this._messages.notext);
        const {key} = this.agent();
        const {id, q} = packet;
        const content = [
          `::BEGIN:${key.toUpperCase()}:CHAT:${id}`,
          q.text,
          `::END:${key.toUpperCase()}:CHAT:${this.hash(q.text)}`
        ].join('\n');
        return this.modules.openai.createChatCompletion({
          model: this.vars.chat.model,
          n: this.vars.chat.n,
          messages: [
            {
              role: this.vars.chat.role,
              name: this.vars.chat.name,
              content,
            }
          ]
        }).then(chat => {
          const {data} = chat;
          const {content} = data.choices[0].message;
          const text = [
            `::begin:${key}:chat:${id}`,
            this._agent.parse(content),
            `::end:${key}:chat:${this.hash(this._agent.parse(content))}`,
          ].join('\n');

          return resolve({
            text,
            html: false,
            data,
          })
        }).catch(err => {
          switch (err.response.status) {
            case 429:
            case 500:
              return resolve(err.response.data.error.message);
              break;
            default:
              return this.error(err.response, JSON.stringify(packet), reject);
          }
        });
      });
    },

    image(packet) {
      this.vars.image.prompt = opts.text;

      return new Promise((resolve, reject) => {
        this.modules.openai.createImage({
          prompt: this.vars.image.prompt,
          n: this.vars.image.n,
          size: this.vars.image.size,
          response_format: this.vars.image.response_format
        }).then(image => {
          const html = [
            `::begin:${key}:chat:${id}`,
            `p: ${this.vars.image.prompt}`,
            `<img class="${this.agent.key}-image" src="${image.data.data[0].url}"/>`
          ]
          return resolve({
            text: this.vars.image.prompt,
            html: `<img class="${this.agent.key}-image" src="${image.data.data[0].url}"/>`,
            data: image.data.data,
          });
        }).catch(reject);
      });
    },

    /**************
    func: tagging
    params: opts - packet containing the question and answer to parse.
    describe: The tagging function takes an 'opts' parameter to parse the various
    tags in a message from the agent. Then it will take that and store it in
    local json files for later use.
    ***************/
    tagging(opts) {

      const {q, a} = opts;                     // receive q, a options from opts
      const {text} = q;
      const {content} = a.choices[0].message;  // isolate content from a
      const tags = {text:false,content:false};                         // add tags key to opts object

      opts.q.tags = {};
      opts.a.tags = {};
      // regular expressions to loop through for detection.
      const reggies = {
        command: /\/\w+/g,
        locaction: /$\w+/g,
        people: /@\w+/g,
        data: /#\w+/g,
      }
      // loop over the regular expressions and if a match is found then append it to the tags object.
      for (let reg in reggies) {
        const _text = text.match(reggies[reg]);
        const _content = content.match(reggies[reg]);
        if (_text) opts.q.tags[reg] = _text;
        if (_content) opts.a.tags[reg] = _content;
      }
      return opts;
    },

  },
  methods: {
    chat(packet) {
      return this.func.chat(packet);
    },
    guru(packet) {
      // from here the guru needs to be able to send messages to story buddy or story teller or both.

    },
    image(packet) {
      return this.func.image(packet.q);
    },
    /**************
    method: uid
    params: packet
    describe: Return a system id to the user from the OpenAI Deva.
    ***************/
    uid(packet) {
      return Promise.resolve({text:this.uid()});
    },

    /**************
    method: status
    params: packet
    describe: Return the current status of the OpenAI Deva.
    ***************/
    status(packet) {
      return this.status();
    },

    /**************
    method: help
    params: packet
    describe: The Help method returns the information on how to use the OpenAI Deva.
    ***************/
    help(packet) {
      return new Promise((resolve, reject) => {
        this.lib.help(packet.q.text, __dirname).then(help => {
          return this.question(`#feecting parse ${help}`);
        }).then(parsed => {
          return resolve({
            text: parsed.a.text,
            html: parsed.a.html,
            data: parsed.a.data,
          });
        }).catch(reject);
      });
    }
  },
  async onInit(data) {
    const {personal} = this.security();
    const configuration = new Configuration({
      apiKey: personal.key,
    });
    // console.log('THIS VARS', this.vars.chat.role);
    this.modules.openai = new OpenAIApi(configuration);
    return this.start(data);
  },
});
module.exports = OPEN
