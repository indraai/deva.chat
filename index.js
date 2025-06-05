// Copyright (c)2025 Quinn Michaels
// Chat Deva
// Chat Deva connects to Open AI ChatGPT services for chat and images.
import Deva from '@indra.ai/deva';
import { OpenAI } from 'openai';
import pkg from './package.json' with {type:'json'};
const {agent,vars} = pkg.data;

// set the __dirname
import querystring from 'node:querystring';
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
      return input;
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
    async chat(opts) {
      this.action('func', 'chat');
      
      const {options,tools} = this.vars.chat;
      const serv = this.modules[this.vars.provider];
      
      const _hist = {
        role: options.role,
        content: opts.text,
      };

      this.vars.history.push(_hist); // push history record into vars.
      const messages = this.vars.history.slice(-10); // gather the 5 latest history items.
      
      if (opts.data.corpus) {
        this.state('set', 'corpus');
        messages.unshift({role: 'system', content: opts.data.corpus});
      }

      if (opts.data.agent) {
        this.state('set', 'agent');
        messages.unshift({role: 'system', content: opts.data.agent});
      }

      if (opts.data.client) {
        this.state('set', 'client');
        messages.unshift({role: 'system', content: opts.data.client});
      }

      if (opts.data.header) {
        this.state('set', 'header');
        messages.unshift({role: 'system', content: opts.data.header});
      }

      this.state('set', 'model');
      const model = this.vars.chat.models[this.vars.provider];

      this.state('set', 'params');
      const params = {
        model,
        n: options.n,
        messages,
        temperature: options.temperature,
        top_p: options.top_p,
        frequency_penalty: options.frequency_penalty,
        presence_penalty: options.presence_penalty,
        tools: this.lib.copy(tools),
      };

      if (opts.data.max_tokens) {
        this.state('set', `max tokens ${opts.data.max_tokens}`);
        params.max_tokens = opts.data.max_tokens;
      }

      const memkey = opts.data.memory || opts.agent.key; // set memkey for agent memory lookup

      this.state('get', 'chat');
      const chat = await serv.chat.completions.create(params)
      const {tool_calls} = chat.choices[0].message;
      let data;
      // this is where we want to trap the function.
      if (tool_calls) {
        this.state('set', 'tool calls');
        messages.push(chat.choices[0].message);

        for (const tool of tool_calls) {
          const func = tool.function.name;
          const funcArgs = JSON.parse(tool.function.arguments);
          const funcResponse = await this.func[func](funcArgs);

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
          n: options.n,
          messages,
          temperature: options.temperature,
          top_p: options.top_p,
          frequency_penalty: options.frequency_penalty,
          presence_penalty: options.presence_penalty,
        };

        this.state('set', 'second chat');
        const second_chat = await serv.chat.completions.create(second_params);
        data = {
          id: second_chat.id,
          model: second_chat.model,
          usage: second_chat.usage,
          role: second_chat.choices[0].message.role,
          text: second_chat.choices[0].message.content,
          created: second_chat.created,
        }
        data.hash = this.lib.hash(data);

        this.state('set', `response:${data.id}`); // set response state
        this.vars.response = this.lib.copy(data);
        if (!opts.history) this.vars.history.push({
          role: data.role,
          content: data.text,
        });
      }
      else {
        this.state('set', 'data');
        data = {
          id: chat.id,
          model: chat.model,
          usage: chat.usage,
          role: chat.choices[0].message.role,
          text: this.utils.process(chat.choices[0].message.content),
          created: chat.created,
        }
        data.hash = this.lib.hash(data);

        this.state('set', `response:${data.id}`); // set response state
        this.vars.response = this.lib.copy(data);

        // push local history of no history in options.
        if (!opts.history) this.vars.history.push({
          role: data.role,
          content: data.text,
        });
      }
      // memory event
      const memorydata = {
        id: chat.id,
        client: opts.client,
        agent: opts.agent,
        q: opts.text,
        a: data.text,
        created: Date.now(),
      }
      memorydata.hash = this.lib.hash(memorydata);
      this.talk('data:memory', memorydata);
      
      this.state('return', 'data');
      return data;
    },
    
    // utility functions for chat feature
    async search_memory(args) {
      this.context('search_memory', args.text);
      this.action('func', 'search_memory');
      const {key} = this.agent();
      const theMem = await this.question(`${this.askChr}data memory:${key}:3 ${args.text}`);
      this.state('return', 'search_memory');
      return theMem.a.text;          
    },
    async search_laws(args) {
      this.context('search_laws', args.text);
      this.action('func', 'search_laws');
      const theLaws = await this.question(`${this.askChr}legal search ${args.text}`);
      this.state('return', 'search_laws');
      return theLaws.a.text;          
    },
    async search_knowledge(args) {
      this.context('search_knowledge', args.text);
      this.action('func', 'search_knowledge');
      const theKnowledge = await this.question(`${this.askChr}data knowledge ${args.text}`);
      this.state('return', 'search_knowledge');
      return theKnowledge.a.text;          
    },

    /**************
    func: speech
    params: opts
    describe: call the openAI api for the text to speech service.
    ***************/
    async speech(opts) {
      this.action('func', 'speech');
      
      const agent = this.agent();
      const {params} = opts.meta;
      const agent_voice = params[1] || agent.profile.voice;
      const agent_key = params[2] || agent.key;
      
      
      const file = `${Date.now()}.mp3`;
      const speechFile = this.lib.path.join(this.config.dir, 'public', 'assets', 'devas', agent_key, 'audio', file);
      const speechUrl = `/public/devas/${agent_key}/audio/${file}`;

      this.state('create', 'speech');
      const mp3 = await this.modules.chatgpt.audio.speech.create({
        model: 'tts-1',
        voice: agent_voice,
        input: decodeURIComponent(opts.text),
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      this.state('write', 'speech file');
      await this.lib.fs.promises.writeFile(speechFile, buffer);

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
        this.state('create', `image`);
        this.modules.chatgpt.images.generate({
          model: this.vars.image.model,
          prompt: this.vars.image.prompt,
          n: this.vars.image.n,
          size: this.vars.image.size,
          response_format: this.vars.image.response_format,
        }).then(image => {
          // here we need to save the return data to a file
          const imageName = `${Date.now()}.png`;
          const imageDay = this.lib.getToday().toString();
          const basePath = this.lib.path.join(this.config.dir, 'assets', 'devas', opts.agent.key, 'gallery');
          const imagePath = this.lib.path.join(basePath, imageDay);
          const imageFile = this.lib.path.join(imagePath, imageName);

          if (!this.lib.fs.existsSync(imagePath)) this.lib.fs.mkdirSync(imagePath, { recursive: true });
          
          const imageUrl = `/assets/devas/${opts.agent.key}/gallery/${imageName}`;

          this.state('write', `image:${imageName}`);
          this.lib.fs.writeFileSync(imageFile, Buffer.from(image.data[0].b64_json, 'base64'), 'base64');

          const data = {
            name: imageName,
            path: imagePath,
            url: imageUrl,
            prompt: this.utils.parse(image.data[0].revised_prompt),
            created: Date.now(),
          };
          data.hash = this.lib.hash(data);

          const jsonFile = this.lib.path.join(basePath, 'main.json')
          // first we need to read the json file if there is one. 
          if (!this.lib.fs.existsSync(jsonFile)) {
            const json = {images:[]}
            this.lib.fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2), {encoding:'utf8'});
          }
          const jsonData = JSON.parse(this.lib.fs.readFileSync(jsonFile, 'utf8'));
          jsonData.images.push(data);

          this.lib.fs.writeFileSync(jsonFile, JSON.stringify(jsonData, null, 2), {encoding:'utf8',flag:'w'})

          this.state('resolve', 'image')
          return resolve(data);
        }).catch(reject);
      });
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
    async modelGet(model, provider) {
      this.action('func', 'modelGet');
      const prov = this.modules[provider];
      const data = await prov.models.retrieve(model);
      console.log('models', data);

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
        const {params} = packet.q.meta;
        if (params[1]) this.vars.provider = params[1];

        this.context('chat', `${this.vars.provider}:${packet.q.agent.profile.name}`);
        packet.q.agent = this.agent();
        const data = {};

        this.action('method', `chat:${this.vars.provider}`);
        this.func.chat(packet.q).then(chat => {
          data.chat = chat;
          const response = [
            `::begin:${this.vars.provider}:${packet.id}`,
            this.utils.parse(chat.text),
            `date: ${this.lib.formatDate(Date.now(), 'long', true)}`,
            `::end:${this.vars.provider}:${this.lib.hash(chat.text)}`,
          ].join('\n');
          this.state('parse', `chat:${this.vars.provider}`);
          return this.question(`${this.askChr}feecting parse ${response}`);
        }).then(feecting => {
          data.feecting = feecting.a.data;
          this.action('return', `chat:${this.vars.provider}`);
          return resolve({
            text:feecting.a.text,
            html: feecting.a.html,
            data,
          });

        }).catch(err => {
          this.state('reject', `chat:${this.vars.provider}`);
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

        this.func.chat(packet.q).then(chat => {
          data.parsed = this.utils.parse(chat.text);
          data.chat = chat;
          this.state('resolve', `relay:${packet.q.agent.profile.name}`);
          return resolve({
            text: this.utils.parse(chat.text),
            html: false,
            data,
          });
        }).catch(err => {
          this.state('reject', `relay:${packet.q.agent.profile.name}`);
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
            `::end:audio:${this.lib.hash(speech)}`
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
            `::end:image:${image.hash}`,
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
  async onReady(data, resolve) {
    const {personal} = this.security();

    const {chat} = this.services().personal;
    this.vars.chat.options = chat.options;
    this.vars.chat.tools = chat.tools;
    this.vars.chat.models = chat.models;
    
    // console.log('THIS VARS', this.vars.chat.role);
    for (const x in personal) {
      this.modules[x] = new OpenAI(personal[x]);
      this.prompt(`provider: ${x}`);
    }
    this.prompt(this.vars.messages.ready);
    return resolve(data);
  },
  onError(err) {
    this.prompt(this.vars.messages.error);
    console.log(err);
  }
});
export default OPEN
