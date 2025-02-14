// Copyright (c)2025 Quinn Michaels
// Chat Deva
// Chat Deva connects to Open AI ChatGPT services for chat and images.
import Deva from '@indra.ai/deva';
import { OpenAI } from 'openai';
import pkg from './package.json' with {type:'json'};

import data from './data.json' with {type:'json'};
const {agent,vars} = data.DATA;

// set the __dirname
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';    
const __dirname = dirname(fileURLToPath(import.meta.url));

const info = {
  id: pkg.id,
  name: pkg.name,
  describe: pkg.description,
  version: pkg.version,
  url: pkg.homepage,
  dir: __dirname,
  git: pkg.repository.url,
  bugs: pkg.bugs.url,
  author: pkg.author,
  license: pkg.license,
  copyright: pkg.copyright,
};
const OPEN = new Deva({
  info,
  agent,
  vars,
  utils: {
    translate(input) {return input.trim();},
    parse(input) {
      return input.split('\n\n').map(p => {
        const beginNum = /^\d/.test(p);
        const valid = p.length && p !== '\n' && !beginNum ? true : false;
        return  valid ? `p: ${p}` : p;
      }).join('\n\n');
    },
    process(input) {
      return input.replace(/If there .+ share them!/g, '')
                  .replace(/Let me know .+ you with!/g, '')
                  .replace(/If you'd like .+ let me know!/g, '')
                  .replace(/If you have .+ share them!/g, '')
                  .replace(/If you have .+ do so!/g, '')
                  .replace(/If you have .+ let me know!/g, '')
                  .replace(/If you have .+ free to ask!/g, '')
                  .replace(/If you have .+ your thoughts!/g, '')
                  .replace(/If you have .+ for further discussion./g, '')
                  .replace(/If you have .+ analysis or discussion./g, '');
    },
  },
  listeners: {
    'open:location'(packet) {
      this.vars.location = packet.data;
    },
    'open:topic'(packet) {
      this.vars.topic = packet.data;
    },
  },
  modules: {
    openai: false,
  },
  func: {
    /**************
    func: chat
    params: opts
      - corpus: is the entity corpus.
      - profile: entity profiles
      - user: the user profile
      - header: the header to use.
      - model: the model to use
      - memory: is the agent key for the memory lookup.
      - max_tokens: the max tokens for the response.
    describe: Call the OpenAI API with the proper data and parameters.
    ***************/
    async chat(content, opts) {
      this.action('func', 'ask');


      const _hist = {
        role: this.vars.chat.role,
        content,
      };
      this.vars.history.push(_hist); // push history record into vars.
      const messages = this.vars.history.slice(-10); // gather the 5 latest history items.

      if (opts.corpus) {
        this.state('set', 'corpus');
        messages.unshift({role: 'system', content: opts.corpus,});
      }

      if (opts.agent) {
        this.state('set', 'agent');
        messages.unshift({role: 'system', content: opts.agent,});
      }

      if (opts.client) {
        this.state('set', 'client');
        messages.unshift({role: 'system', content: opts.client,});
      }

      if (opts.header) {
        this.state('set', 'header');
        messages.unshift({role: 'system', content: opts.header,});
      }

      this.state('set', 'model');
      const _model = opts.model || this.vars.chat.model;
      const model = this.func.getModel(_model);

      this.state('set', 'params');
      const params = {
        model,
        n: this.vars.chat.n,
        messages,
        temperature: this.vars.chat.temperature,
        top_p: this.vars.chat.top_p,
        frequency_penalty: this.vars.chat.frequency_penalty,
        presence_penalty: this.vars.chat.presence_penalty,
        tools: this.lib.copy(this.vars.chat.tools),
      };

      if (opts.max_tokens) {
        this.action('set', 'max tokens');
        params.max_tokens = opts.max_tokens;
      }

      const memkey = opts.memory || this.agent().key;
      const self = this;

      async function search_memory(args) {
        const theMem = await self.question(`${self.askChr}data memory:${memkey}:3 ${args.text}`);
        return theMem.a.text;
      }

      async function search_knowledge(args) {
        const theKnowledge = await self.question(`${self.askChr}data knowledge:3 ${args.text}`);
        return theKnowledge.a.text;
      }

      async function get_hymn(args) {
        const theHymn = await self.question(`${self.askChr}veda hymn ${args.hymn}`);
        return theHymn.a.text;
      }

      const funcs = {
        search_knowledge,
        search_memory,
        // search_archive,
        // get_hymn,
      }

      this.state('get', 'chat');
      const chat = await this.modules.openai.chat.completions.create(params)
      const {tool_calls} = chat.choices[0].message;

      // this is where we want to trap the function.
      if (tool_calls) {
        this.state('set', 'tool calls');
        messages.push(chat.choices[0].message);

        for (const tool of tool_calls) {
          const func = tool.function.name;
          const funcArgs = JSON.parse(tool.function.arguments);
          const funcResponse = await funcs[func](funcArgs);
          messages.push({
            tool_call_id: tool.id,
            role: "tool",
            name: func,
            content: funcResponse || 'no-data',
          }); // extend conversation with function response
        }

        this.state('set', 'second params');
        const second_params = {
          model,
          n: this.vars.chat.n,
          messages,
          temperature: this.vars.chat.temperature,
          top_p: this.vars.chat.top_p,
          frequency_penalty: this.vars.chat.frequency_penalty,
          presence_penalty: this.vars.chat.presence_penalty,
        };

        this.context('second_chat');
        const second_chat = await this.modules.openai.chat.completions.create(second_params);
        const second_data = {
          id: second_chat.id,
          model: second_chat.model,
          usage: second_chat.usage,
          role: second_chat.choices[0].message.role,
          text: second_chat.choices[0].message.content,
          created: second_chat.created,
        }

        this.state('set', 'response'); // set response state
        this.vars.response = this.lib.copy(second_data);
        if (!opts.history) this.vars.history.push({
          role: second_data.role,
          content: second_data.text,
        });

        this.state('return', 'second chat');
        return second_data;
      }

      else {
        this.state('set', 'first chat');
        const data = {
          id: chat.id,
          model: chat.model,
          usage: chat.usage,
          role: chat.choices[0].message.role,
          text: this.utils.process(chat.choices[0].message.content),
          created: chat.created,
        }

        this.state('set', 'response'); // set response state
        this.vars.response = this.lib.copy(data);

        // push local history of no history in options.
        if (!opts.history) this.vars.history.push({
          role: data.role,
          content: data.text,
        });
        this.state('return', 'first chat');
        return data;
      }
    },


    /**************
    func: speech
    params: opts
    describe: call the openAI api for the text to speech service.
    ***************/
    async speech(opts) {
      this.action('func', 'speech');
      const file = `${Date.now()}.mp3`;
      const speechFile = this.path.join(this.config.dir, 'public', 'devas', opts.agent.key, 'audio', file);
      const speechUrl = `/public/devas/${opts.agent.key}/audio/${file}`;

      this.state('create', 'speech');
      const mp3 = await this.modules.openai.audio.speech.create({
        model: this.vars.speech.model,
        voice: opts.meta.params[1] || this.vars.speech.voice,
        input: opts.text,
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      this.state('write', 'speech file');
      await this.fs.promises.writeFile(speechFile, buffer);

      this.state('return', 'speech');
      return {
        path: speechFile,
        url: speechUrl,
      };
    },

    /**************
    func: image
    params: opts
    describe: image function to generate a new image.
    ***************/
    image(opts) {
      this.action('func', 'image')
      this.vars.image.prompt = opts.text;
      const {key} = this.agent();
      return new Promise((resolve, reject) => {
        if (!opts.text) return resolve(this._messages.notext);
        if (opts.meta.params[1] && this.vars.image.sizes[opts.meta.params[1]]) {
          this.vars.image.size = this.vars.image.sizes[opts.meta.params[1]];
        }
        this.state('create', 'image');
        this.modules.openai.images.generate({
          model: this.vars.image.model,
          prompt: this.vars.image.prompt,
          n: this.vars.image.n,
          size: this.vars.image.size,
          response_format: this.vars.image.response_format,
        }).then(image => {
          // here we need to save the return data to a file
          const imageName = `${Date.now()}.png`;
          const imagePath = this.path.join(this.config.dir, 'public', 'devas', opts.agent.key, 'gallery', imageName);
          const imageUrl = `/public/devas/${opts.agent.key}/gallery/${imageName}`;

          this.state('write', 'image');
          this.fs.writeFile(imagePath, Buffer.from(image.data[0].b64_json, 'base64'), 'base64', err => {
            if (err) console.log('file write err', err);
          });

          const data = {
            name: imageName,
            path: imagePath,
            url: imageUrl,
            prompt: this.utils.parse(image.data[0].revised_prompt),
          };

          this.state('resolve', 'image')
          return resolve(data);
        }).catch(reject);
      });
    },

    async fileGet(file) {
      this.action('func', 'fileGet');
      const data = await this.modules.openai.files.retrieve(file);
      const text = [
        `::begin:file:${data.id}`,
        `### File Details`,
        `id: ${data.id}`,
        `file: ${data.filename}`,
        `status: ${data.status}`,
        `created: ${this.formatDate(data.created_at * 1000, 'long', true)}`,
        `::end:file`
      ].join('\n');
      return {
        text,
        data,
      };
    },

    async fileUpload(file) {
      this.action('func', 'fileUpload');
      const data = await this.modules.openai.files.create({
        file: this.fs.createReadStream(file),
        purpose: this.vars.file.purpose
      });
      const text = [
        `::begin:file:${data.id}`,
        `### File Upload`,
        `id: ${data.id}`,
        `file: ${data.filename}`,
        `purpose: ${data.purpose}`,
        `status: ${data.status}`,
        `created: ${this.formatDate(data.created_at * 1000, 'long', true)}`,
        `::end:file`
      ].join('\n');
      return {
        text,
        data,
      };
    },

    async fileList(file) {
      this.context('func', 'fileList');
      const files = await this.modules.openai.files.list();

      const text = files.data.map(file => {
        return [
          `::begin:file:${file.id}`,
          `#### ${file.id}`,
          `id: ${file.id}`,
          `status: ${file.status}`,
          `purpose: ${file.purpose}`,
          `filename: ${file.filename}`,
          `created: ${this.formatDate(file.created_at * 1000, 'long', true)}`,
          '::end:file',
        ].join('\n');
      });
      text.unshift('### Files');
      return {
        text: text.join('\n\n'),
        data: files.data,
      };
    },

    async tuneCreate(file) {
      this.action('func', 'tuneCreate');
      const data = await this.modules.openai.fineTuning.jobs.create({
        training_file: file,
        model: this.func.getModel(this.vars.tune.model, 'tune'),
      });

      const text = [
        `id: ${data.id}`,
        `model: ${data.model}`,
        `created: ${this.formatDate(data.created_at * 1000, 'long', true)}`,
        `status: ${data.status}`,
        `file: ${data.file}`,
        `error: ${data.error}`,
      ].join('\n');

      return {
        text,
        data,
      }
    },

    async tuneList() {
      this.action('func', 'tuneList');
      const jobs = await this.modules.openai.fineTuning.jobs.list();
      const text = jobs.data.map(job => {
        return [
          `::begin:job`,
          `#### ${job.id}`,
          `id: ${job.id}`,
          `status: ${job.status}`,
          `model: ${job.model}`,
          `created: ${this.formatDate(job.created * 1000, 'long', true)}`,
          `file: ${job.training_file}`,
          job.error ? `${job.error.message}` : '',
          `::end:job`,
        ].join('\n');
      }).join('\n\n');
      return {
        text,
        data: jobs.data,
      };
    },

    async tuneGet(job) {
      this.action('func', 'tuneGet');
      const data = await this.modules.openai.fineTuning.jobs.retrieve(job);
      const text = [
        `::begin:job:${data.id}`,
        '### Fine Tune Job',
        `id: ${data.id}`,
        `status: ${data.status}`,
        `file: ${data.training_file}`,
        `base: ${data.model}`,
        `model: ${data.fine_tuned_model}`,
        `tokens: ${data.trained_tokens}`,
        `created: ${this.formatDate(data.created_at * 1000, 'long', true)}`,
        `finished: ${this.formatDate(data.finished_at * 1000, 'long', true)}`,
        `::end:job`,
      ].join('\n');
      return {
        text,
        data,
      }
    },

    async tuneCancel(job) {
      this.action('func', 'tuneCancel');
      const data = await this.modules.openai.fineTuning.jobs.cancel(job);
      return {
        text: data.id,
        data,
      }
    },

    /**************
    func: modelList
    params: none
    describe: Get the listing of models from the api.
    ***************/
    async modelList() {
      this.action('func', 'modelList');
      const models = await this.modules.openai.models.list();
      const text = models.data.map(item => {
        return [
          `::begin:model`,
          `#### ${item.id}`,
          `id: ${item.id}`,
          `owner: ${item.owned_by}`,
          `::end:model`,
        ].join('\n');
      });
      text.unshift('## Models');
      return {
        text: text.join('\n'),
        data: models.data,
      };
    },

    /**************
    func: modelGet
    params: model
    describe: Get a specfic model details from the api.
    ***************/
    async modelGet(model) {
      this.action('func', 'modelGet');
      const data = await this.modules.openai.models.retrieve(model);

      const text = [
        `::begin:model:${data.id}`,
        '### Model Details',
        `id: ${data.id}`,
        `parent: ${data.parent}`,
        `root: ${data.root}`,
        `created: ${this.formatDate(data.created * 1000, 'long', true)}`,
        '::end:model',
      ].join('\n');
      return {
        text,
        data,
      }
    },

    processor(packet, funcMap) {
      const data = {};
      const func = funcMap[packet.q.meta.params[1]];
      return new Promise((resolve, reject) => {
        this.func[func](packet.q.text).then(file => {
          data.file = file.data;
          return this.question(`${this.askChr}feecting parse ${file.text}`);
        }).then(feecting => {
          data.feecting = feecting.a.data;
          return resolve({
            text: feecting.a.text,
            html: feecting.a.html,
            data,
          })
        }).catch(err => {
          return this.error(err, packet, reject);
        });
      });
    },

    /**************
    func: setModel
    params: model
    describe: Set the current model that the AI is suppose to use.
    ***************/
    setModel(model=false, type='chat') {
      if (!model) return model;
      const models = this.services().personal[type].models;
      if (!models || !models[model]) return false;
      this.vars[type].model = model;
    },

    /**************
    func: getModel
    params: model
    describe: Get a model value from services.
    ***************/
    getModel(model=false,type='chat') {
      if (!model) return model;
      const models = this.services().personal[type].models;
      if (!models) return false;
      if (!models[model]) return models[this.vars[type].model];
      return models[model];
    }
  },

  methods: {

    /**************
    method: chat
    params: packet
    describe: send a chat to oepnai
    ***************/
    chat(packet) {
      return new Promise((resolve, reject) => {
        if (!packet) return (`chat: ${this._messages.nopacket}`);

        this.context('chat', packet.q.agent.profile.name);
        this.action('method', 'chat');
        const agent = this.agent();
        const data = {};

        if (packet.q.meta.params[1]) this.func.setModel(packet.q.meta.params[1]);
        this.func.chat(packet.q.text, packet.q.data).then(chat => {
          data.chat = chat;
          const response = [
            `::begin:${chat.role}:${packet.id}`,
            this.utils.parse(chat.text),
            `::end:${chat.role}:${this.lib.hash(chat.text)}`,
            `date: ${this.lib.formatDate(Date.now(), 'long', true)}`,
          ].join('\n');
          this.state('parse', 'chat');
          return this.question(`${this.askChr}feecting parse ${response}`);

        }).then(feecting => {
          data.feecting = feecting.a.data;
          this.action('resolve', 'chat');
          return resolve({
            text:feecting.a.text,
            html: feecting.a.html,
            data,
          });

        }).catch(err => {
          this.state('reject', 'chat');
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
      const { meta, text } = packet.q;
      const role = meta.params[1] || false;
      const data = {};
      return new Promise((resolve, reject) => {
        if (!packet) return resolve(`relay: ${this._messages.nopacket}`);
        if (!text) return resolve(this._messages.notext);

        this.context('relay', packet.q.agent.profile.name);
        this.action('method', 'relay');

        this.func.chat(text, packet.q.data).then(chat => {
          data.parsed = this.utils.parse(chat.text);
          data.chat = chat;
          this.state('resolve', `relay:${packet.q.agent.profile.name}`);
          return resolve({
            text: chat.text,
            html: false,
            data,
          });
        }).catch(err => {
          this.state('reject', `relay:${packet.q.agent.profile.name}`);
          console.log('PACKET DATA', packet.q.data);
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
      this.context('response');
      return Promise.resolve({text:this.vars.response.text});
    },

    /**************
    func: speech
    params: packet
    describe: transcribe text to speech
    ***************/
    speech(packet) {
      const agent = this.agent();
      const data = {};
      return new Promise((resolve, reject) => {
        if (!packet) return resolve(`speech: ${this._messages.nopacket}`);
        if (!packet.q.text) return resolve(`speech: ${this._messages.notext}`);

        this.context('speech', packet.q.agent.name);
        this.action('method', 'speech');

        this.func.speech(packet.q).then(speech => {
          data.speech = speech;
          const text = [
            `::begin:audio:${packet.id}`,
            `audio[tts]:${speech.url}`,
            `url: ${speech.url}`,
            `::end:audio:${this.hash(speech)}`
          ].join('\n');
          this.state('parse', 'speech');
          return this.question(`${this.askChr}feecting parse ${text}`);
        }).then(feecting => {
          data.feecting = feecting.a.data;
          this.state('resolve', 'speech');
          return resolve({
            text: feecting.a.text,
            html: feecting.a.html,
            data,
          })
        }).catch(err => {
          this.context('error', this.vars.messages.error_speech)
          return this.error(err, packet, reject);
        });
      });
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
        this.func.image(packet.q).then(image => {
          data.image = image;
          const text = [
            `::begin:image:${packet.id}`,
            `image:${image.url}`,
            `url: ${image.url}`,
            ``,
            `${image.prompt}`,
            `::end:image:${this.hash(image)}`,
          ].join('\n');
          return this.question(`${this.askChr}feecting parse ${text}`);
        }).then(feecting => {
          data.feecting = feecting.a.data;
          return resolve({
            text: feecting.a.text,
            html: feecting.a.html,
            data,
          })
        }).catch(err => {
          this.context('error', this.vars.messages.error_image)
          return this.error(err, packet, reject);
        })
      });
    },

    file(packet) {
      const data = {};
      return this.func.processor(packet, this.vars.funcMap.file);
    },
    tune(packet) {
      return this.func.processor(packet, this.vars.funcMap.tune);
    },
    model(packet) {
      return this.func.processor(packet, this.vars.funcMap.model);
    },

    /**************
    method: topic
    params: packet
    describe: set the global topic for the conversation.
    ***************/
    topic(packet) {
      this.context('topic', this.trimWords(packet.q.text, 3));
      return new Promise((resolve, reject) => {
        if (!packet.q.text) return resolve({text:this.vars.topic});
        this.vars.topic = packet.q.text;
        const topic = `topic: ${this.vars.topic}`;
        this.question(`${this.askChr}feecting parse ${topic}`).then(parsed => {
          return resolve({
            text: parsed.a.text,
            html: parsed.a.html,
            data: parsed.a.data
          })
        }).catch(err => {
          return this.error(packet, err, reject);
        });
      });
    },

    /**************
    method: location
    params: packet
    describe: set the global location for the conversation
    ***************/
    location(packet) {
      this.context('location', this.trimWords(packet.q.text, 3));
      return new Promise((resolve, reject) => {
        if (!packet.q.text) return resolve({text:this.vars.location});
        this.vars.location = packet.q.text;
        const location = `location: ${this.vars.location}`;
        this.question(`${this.askChr}feecting parse ${location}`).then(parsed => {
          return resolve({
            text: parsed.a.text,
            html: parsed.a.html,
            data: parsed.a.data
          })
        }).catch(err => {
          return this.error(packet, err, reject);
        });
      });
    }
  },
  async onInit(data, resolve) {
    const {personal} = this.security();

    const {chat} = this.services().personal;
    this.vars.chat.tools = chat.tools;

    // console.log('THIS VARS', this.vars.chat.role);
    this.modules.openai = new OpenAI({
      apiKey: personal.key,
    });
    return this.start(data, resolve);
  },
  onReady(data, resolve) {
    this.prompt(this.vars.messages.ready);
    return resolve(data);
  },
  onError(err) {
    this.prompt(this.vars.messages.error);
    console.log(err);
  }
});
export default OPEN
