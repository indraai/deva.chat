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
  dir: __dirname,
  git: package.repository.url,
  bugs: package.bugs.url,
  author: package.author,
  license: package.license,
  copyright: package.copyright,
};

const data_path = path.join(__dirname, 'data.json');
const {agent,vars} = require(data_path).DATA;

const Deva = require('@indra.ai/deva');
const OPEN = new Deva({
  info,
  agent,
  vars,
  utils: {
    translate(input) {return input.trim();},
    parse(input) {
      return input.split('\n\n').map(p => {
        if (p.length && p !== '\n') return `p: ${p}`;
      }).join('\n\n');
    },
    process(input) {return input.trim()},
  },
  listeners: {},
  modules: {
    openai: false,
  },
  func: {
    chat(content, role=false) {

      this.context('chat_func');
      this.vars.history.push({
        role: role || this.vars.chat.role,
        content,
      });

      return new Promise((resolve, reject) => {
        if (!content) return resolve(this._messages.notext);
        return this.modules.openai.createChatCompletion({
          model: this.vars.chat.model,
          n: this.vars.chat.n,
          messages: this.vars.history.slice(-6),
        }).then(chat => {
          const data = {
            id: chat.data.id,
            model: chat.data.model,
            usage: chat.data.usage,
            role: chat.data.choices[0].message.role,
            text: this.utils.process(chat.data.choices[0].message.content),
            created: chat.data.created,
          }
          this.vars.response = this.copy(data);
          this.vars.history.push({
            role: data.role,
            content: data.text,
          });
          this.context('chat_func_response');
          return resolve(data)
        }).catch(err => {
          this.context('error');
          if (err.response && err.response.status) {
            switch (err.response.status) {
              case 429:
              case 500:
                return resolve({error:err.response.data.error.message});
                break;
              default:
                return reject(err);
            }
          }
          else {
            return reject(err);
          }
        });
      });
    },

    image(packet) {
      this.vars.image.prompt = packet.q.text;
      const {key} = this.agent();
      const {id, q} = packet;
      return new Promise((resolve, reject) => {
        if (!packet.q.text) return resolve(this._messages.notext);
        if (packet.q.meta.params[1] && this.vars.image.sizes[packet.q.meta.params[1]]) {
          this.vars.image.size = this.vars.image.sizes[packet.q.meta.params[1]];
        }
        this.context('image_create');
        this.modules.openai.createImage({
          prompt: this.vars.image.prompt,
          n: this.vars.image.n,
          size: this.vars.image.size,
          response_format: this.vars.image.response_format
        }).then(image => {
          this.context('image_done');
          return resolve(image.data.data);
        }).catch(reject);
      });
    },

  },
  methods: {
    /**************
    method: chat
    params: packet
    describe: send a chat to oepnai
    ***************/
    chat(packet) {
      this.context('chat');
      const agent = this.agent();
      const data = {};
      return new Promise((resolve, reject) => {
        if (!packet) return (this._messages.nopacket);
        const role = packet.q.meta.params[1] || this.vars.role;

        const content = [
          `::begin:${role}:${packet.id}`,
          packet.q.text,
          `::end:${role}:${this.hash(packet.q.text)}`,
          `date: ${this.formatDate(Date.now(), 'long', true)}`,
        ].join('\n');

        this.func.chat(content, role).then(chat => {
          data.chat = chat;
          const text = [
            `::begin:${agent.key}:${packet.id}`,
            this.utils.parse(chat.text),
            `::end:${agent.key}:${this.hash(chat.text)}`,
          ].join('\n');
          this.context('chat_feecting');
          return this.question(`#feecting parse ${text}`);
        }).then(feecting => {
          data.feecting = feecting.a.data;
          this.context('chat_done');
          return resolve({
            text:feecting.a.text,
            html: feecting.a.html,
            data,
          });
        }).catch(err => {
          this.context('error');
          return this.error(err, packet, reject);
        })
      });
    },

    /**************
    method: relay
    params: packet
    describe: send a relay to oepnai without a formatted return.
    ***************/
    relay(packet) {
      this.context('relay');
      const agent = this.agent();
      const role = packet.q.meta.params[1] || false;
      return new Promise((resolve, reject) => {
        if (!packet) return (this._messages.nopacket);
        this.func.chat(packet.q.text, role).then(chat => {
          const parsed = this.utils.parse(chat.text);
          this.context('relay_done');
          return resolve({
            text:parsed,
            html: false,
            data: chat,
          });
        }).catch(err => {
          this.context('error');
          return this.error(err, packet, reject);
        })
      });
    },

    /**************
    func: response
    params: packet
    describe: return the last response to the caller.
    ***************/
    response(packet) {
      this.context('shuttle');
      return Promise.resolve({text:this.vars.response.text});
    },

    /**************
    method: images
    params: packet
    describe: get an image from oepn ai
    ***************/
    image(packet) {
      this.context('image');
      const data = {};
      return new Promise((resolve, reject) => {
        this.func.image(packet).then(images => {
          data.images = images;
          const text = [
            `## Images`,
            `::begin:images:${packet.id}`,
            images.map(img => `image: ${img.url}`).join('\n'),
            `::end:images:${this.hash(images)}`,
          ].join('\n');
          return this.question(`#feecting parse ${text}`);
        }).then(feecting => {
          data.feecting = feecting.a.data;
          return resolve({
            text: feecting.a.text,
            html: feecting.a.html,
            data,
          })
        }).catch(err => {
          return this.error(err, packet, reject);
        })
      });
    },
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
