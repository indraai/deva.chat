// Copyright (c)2023 Quinn Michaels
// OpenAI Deva
// used for connecting into open ai services for cht and images.

const { OpenAI } = require("openai");

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

const {agent,vars} = require('./data.json').DATA;

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
    chat(content, opts) {
      this.context('chat_func');
      if (opts.history) opts.history.push({
        role: this.vars.chat.role,
        content,
      });
      else this.vars.history.push({
        role: this.vars.chat.role,
        content,
      });

      const messages = opts.history || this.vars.history.slice(-7);
      
      if (opts.corpus) messages.unshift({
        role: 'system',
        content: opts.corpus,
      });

      if (opts.profile) messages.unshift({
        role: 'system',
        content: opts.profile,
      });

      if (opts.header) messages.unshift({
        role: 'system',
        content: opts.header,
      });

      return new Promise((resolve, reject) => {
        if (!content) return resolve(this._messages.notext);
        return this.modules.openai.chat.completions.create({
          model: opts.model || this.vars.chat.model,
          n: this.vars.chat.n,
          messages,
        }).then(chat => {
          const data = {
            id: chat.id,
            model: chat.model,
            usage: chat.usage,
            role: chat.choices[0].message.role,
            text: this.utils.process(chat.choices[0].message.content),
            created: chat.created,
          }
          this.vars.response = this.copy(data);
          if (!opts.history) this.vars.history.push({
            role: data.role,
            content: data.text,
          });
          this.context('chat_func_response');
          return resolve(data);
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
        if (!q.text) return resolve(this._messages.notext);
        if (q.meta.params[1] && this.vars.image.sizes[q.meta.params[1]]) {
          this.vars.image.size = this.vars.image.sizes[q.meta.params[1]];
        }
        if (q.meta.params[2]) this.vars.image.n = parseInt(q.meta.params[2]);
        this.context('image_create');
        this.modules.openai.images.generate({
          prompt: this.vars.image.prompt,
          n: this.vars.image.n,
          size: this.vars.image.size,
          response_format: this.vars.image.response_format
        }).then(image => {
          this.context('image_done');
          return resolve(image.data);
        }).catch(reject);
      });
    },

    async fileGet(file) {
      this.context('fileGet');
      const data = await this.modules.openai.files.retrieve(file);

      const text = [
        `### Get File`,
        `id: ${data.id}`,
        `file: ${data.filename}`,
        `status: ${data.status}`,
        `details: ${data.status_details}`,
        `created: ${this.formatDate(data.created_at, 'long', true)}`,
      ].join('\n');

      return {
        text,
        data,
      };
    },

    async fileUpload(file) {
      this.context('fileUpload');
      console.log('UPLOADING FILE', file);
      const data = await this.modules.openai.files.create({
        file: this.fs.createReadStream(file),
        purpose: this.vars.file.purpose
      });
      console.log('DATA', data);
      const text = [
        `### File Upload`,
        `id: ${data.id}`,
        `file: ${data.filename}`,
        `purpose: ${data.purpose}`,
        `status: ${data.status}`,
        `created: ${this.formatDate(data.created_at, 'long', true)}`,
      ].join('\n');
      return {
        text,
        data,
      };
    },

    async fileDelete(file) {
      this.context('fileDelete');
      const data = await this.modules.openai.files.del(file);

      return {
        text: `Delete: ${data.id}`,
        data,
      };
    },

    async fileList(file) {
      this.context('fileList');
      const files = await this.modules.openai.files.list();

      const text = files.data.map(file => {
        return [
          '::begin:file',
          `#### ${file.id}`,
          `id: ${file.id}`,
          `status: ${file.status}`,
          `purpose: ${file.purpose}`,
          `filename: ${file.filename}`,
          `created: ${this.formatDate(file.created_at, 'long', true)}`,
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
      const data = await this.modules.openai.fineTuning.jobs.create({
        training_file: file,
        model: this.vars.job.model,
      });

      console.log('tune create', data);
      const text = [
        `id: ${data.id}`,
        `model: ${data.model}`,
        `created: ${this.formatDate(data.created_at, 'long', true)}`,
        `organization: ${data.organization_id}`,
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
      const jobs = await this.modules.openai.fineTuning.jobs.list();
      const text = jobs.data.map(job => {
        return [
          `::begin:job`,
          `#### ${job.id}`,
          `id: ${job.id}`,
          `status: ${job.status}`,
          `model: ${job.model}`,
          `created: ${this.formatDate(job.created, 'long', true)}`,
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
      const data = await this.modules.openai.fineTuning.jobs.retrieve(job);

      console.log('tune get', data);

      return {
        text: data.id,
        data,
      }
    },

    async tuneCancel(job) {
      const data = await this.modules.openai.fineTuning.jobs.cancel(job);

      console.log('tune cancel', data);

      return {
        text: data.id,
        data,
      }
    },

    async modelList() {
      const models = await this.modules.openai.models.list();

      console.log('MODELS', models.data);
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
        text,
        data: models.data,
      };
    },

    async modelGet(model) {
      const data = await this.modules.openai.models.retrieve(model);

      console.log('MODEL GET', data);

      return {
        text: data.id,
        data,
      }
    },

    async modelDelete(model) {
      const data = await this.modules.openai.models.del(model);

      console.log('model delete', data);

      return {
        text: data.id,
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
          return this.error(packet, err, reject);
        });
      });
    }
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
        const role = packet.q.meta.params[1] || this.vars.chat.role;
        const model = packet.q.data.model || false;
        const profile = packet.q.data.profile || false;
        const corpus = packet.q.data.corpus || false;
        const history = packet.q.data.history || false;
        this.func.chat(packet.q.text, {model,profile,corpus,history}).then(chat => {
          data.chat = chat;
          const response = [
            `::begin:${chat.role}:${packet.id}`,
            this.utils.parse(chat.text),
            `::end:${chat.role}:${this.hash(chat.text)}`,
            `date: ${this.formatDate(Date.now(), 'long', true)}`,
          ].join('\n');
          this.context('chat_feecting');
          return this.question(`${this.askChr}feecting parse ${response}`);
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
      const profile = packet.q.data.profile || false;
      const corpus = packet.q.data.corpus || false;
      const history = packet.q.data.history || false;
      return new Promise((resolve, reject) => {
        if (!packet) return (this._messages.nopacket);
        this.func.chat(packet.q.text, {profile,history,corpus}).then(chat => {
          this.context('relay_done');
          return resolve({
            text: chat.text,
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
      this.context('response');
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
            `::begin:images:${packet.id}`,
            images.map(img => `image: ${img.url}`).join('\n'),
            `::end:images:${this.hash(images)}`,
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
  },
  async onInit(data) {
    const {personal} = this.security();
    // console.log('THIS VARS', this.vars.chat.role);
    this.modules.openai = new OpenAI({
      organization: personal.org,
      apiKey: personal.key,
    });
    return this.start(data);
  },
  onError(err) {
    console.log('OPEN ERROR', err);
  }
});
module.exports = OPEN
