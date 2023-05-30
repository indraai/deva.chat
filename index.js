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
const {agent,vars} = require(data_path).DATA;

function runCleaner(input) {
  const theFile = fs.readFileSync(path.join(__dirname, 'data.json'));
  const theData = JSON.parse(theFile).DATA;
  const {cleaner} = theData;
  const clean = input.split('\n\n').length ? input.split('\n\n') : input;
  const cleaned = [];

  // loop over paragraph text
  for (const x of clean) {
    let _clean = x;
    // loop cleaner data
    for (const y in cleaner) {
      const cReg = new RegExp(y, 'g');
      const isDirty = cReg.exec(_clean) || false;
      if (isDirty) _clean = _clean.replace(cReg, cleaner[y]);
    }
    cleaned.push(_clean)
  }
  return cleaned.join('\n');
}

const Deva = require('@indra.ai/deva');
const OPEN = new Deva({
  info,
  agent: {
    id: agent.id,
    key: agent.key,
    prompt: agent.prompt,
    voice: agent.voice,
    profile: agent.profile,
    translate(input) {
      return input.trim();
    },
    parse(input) {
      return input.trim();
    },
    process(input) {
      return runCleaner(input);
    },
  },
  vars,
  listeners: {},
  modules: {
    openai: false,
  },
  devas: {},
  func: {
    chat(content) {
      return new Promise((resolve, reject) => {
        if (!content) return resolve(this._messages.notext);
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
          const data = {
            id: chat.data.id,
            model: chat.data.model,
            usage: chat.data.usage,
            role: chat.data.choices[0].message.role,
            text: chat.data.choices[0].message.content,
            created: chat.data.created,
          }
          this.vars.response = this.copy(data);
          this.vars.history.push(this.vars.response);
          resolve(data)
        }).catch(err => {
          switch (err.response.status) {
            case 429:
            case 500:
              return resolve({error:err.response.data.error.message});
              break;
            default:
              return reject(e);
          }
        });
      });
    },

    image(packet) {
      this.vars.image.prompt = opts.text;
      const {key} = this.agent();
      const {id, q} = packet;
      return new Promise((resolve, reject) => {
        if (!packet.q.text) return resolve(this._messages.notext);
        this.modules.openai.createImage({
          prompt: this.vars.image.prompt,
          n: this.vars.image.n,
          size: this.vars.image.size,
          response_format: this.vars.image.response_format
        }).then(image => {
          const hash_val = [
            `p:${this.vars.image.prompt}`,
          ];
          image.data.data.forEach(img => {
            hash_val.push(`image: ${img.url}`);
          })

          const text = [
            `::begin:${key}:image:${id}`,
            hash_val.join('\n'),
            `::end:${key}:image:${this.hash(hash_val.join('\n'))}`
          ].join('\n')
          return resolve({
            text,
            html: false,
            data: image.data.data,
          });
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
      const agent = this.agent();
      const client = this.agent();
      const data = {};
      return new Promise((resolve, reject) => {
        if (!packet) return (this._messages.nopacket);
        const question = [
          `::begin:${client.key}:${packet.id}`,
          packet.q.text,
          `::end:${client.key}:${this.hash(packet.q.text)}`,
        ].join('\n')
        this.func.chat(question).then(chat => {
          const processed = this._agent.process(chat.text);
          data.chat = chat;
          const text = [
            `::begin:${agent.key}:${packet.id}`,
            processed,
            `::end:${agent.key}:${this.hash(processed)}`,
          ].join('\n');
          return this.question(`#feecting parse:${agent.key} ${text}`);
        }).then(feecting => {
          data.feecting = feecting.a.data;
          return resolve({
            text:feecting.a.text,
            html: feecting.a.html,
            data,
          });
        }).catch(err => {
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
      const agent = this.agent();
      return new Promise((resolve, reject) => {
        if (!packet) return (this._messages.nopacket);
        this.func.chat(packet.q.text).then(chat => {
          const parsed = this._agent.parse(chat.text);
          return resolve({
            text:parsed,
            html: false,
            data: chat,
          });
        }).catch(err => {
          return this.error(err, packet, reject);
        })
      });
    },

    /**************
    method: shuttle
    params: packet
    describe: send a shuttle to #puppet.
    ***************/
    shuttle(packet) {
      const agent = this.agent();
      const processed = this._agent.process(this.vars.response.text);
      const text = [
        this.vars.messages.shuttle,
        `::begin:${agent.key}:${packet.id}`,
        processed,
        `::end:${this.agent.key}:${this.hash(processed)}`
      ].join('\n');
      if (!packet) return (this._messages.nopacket);
      this.prompt(text);
      return new Promise((resolve, reject) => {
        this.question(`#puppet relay ${text}`).then(puppet => {
          return resolve({
            text: puppet.a.text,
            html: puppet.a.html,
            data: puppet.a.data,
          })
        }).catch(reject);
      });
    },

    /**************
    method: doc
    params: packet
    describe: send a doc to #puppet.
    ***************/
    doc(packet) {
      const agent = this.agent();
      const data = {}, text = [];

      return new Promise((resolve, reject) => {
        this.question(`#docs raw ${packet.q.text}`).then(doc => {
          data.doc = doc.a.data;
          text.push(doc.a.text);
          return this.func.chat(doc.a.text)
        }).then(chat => {
          data.chat = chat;
          text.push('');
          text.push(chat.text);
          return this.question(`#feecting parse:${agent.key} ${text.join('\n')}`);
        }).then(feecting => {
          data.feecting = feecting.a.data;
          return resolve({
            text: feecting.a.text,
            htaml: feecting.a.html,
            data,
          });
        }).catch(err => {
          return this.error(err, packet, reject);
        })

      });
    },

    /**************
    method: images
    params: packet
    describe: get an image from oepn ai
    ***************/
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
