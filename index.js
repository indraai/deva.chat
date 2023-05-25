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
    prompt: agent.prompt,
    voice: agent.voice,
    profile: agent.profile,
    translate(input) {
      return input.trim();
    },
    parse(input) {
      return input.trim();
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

        const question = [ // construct the main question array
          `::BEGIN:QUESTION:${id}`, // include the begin block with id
          q.text, // include the text of the packet
          `::END:QUESTION:${this.hash(packet.q.text)}`, // set the end block with the hash of the question text.
        ].join('\n'); // join the array on line breaks to for the text block
        this.prompt(question);
        return this.modules.openai.createChatCompletion({
          model: this.vars.chat.model,
          n: this.vars.chat.n,
          messages: [
            {
              role: this.vars.chat.role,
              name: this.vars.chat.name,
              content: question,
            }
          ]
        }).then(chat => {
          const {content} = chat.data.choices[0].message;
          const answer = [
            `::BEGIN:ANSWER:${id}`, // begin the block container with the id
            content,  // place the content in the answer block container
            `::END:ANSWER:${this.hash(content)}`, // hash the answer content
          ].join('\n'); // jion the array on line break to create text block.
          return resolve({
            text: answer,
            html: false,
            data: chat.data,
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
      return this.func.chat(packet);
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
