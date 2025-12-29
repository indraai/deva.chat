"use strict";
// Copyright ©2025 Quinn A Michaels; All rights reserved. 
// Legal Signature Required For Lawful Use.
// Distributed under VLA:61354447825896340844 LICENSE.md

// Chat Deva
// Chat Deva connects to Open AI ChatGPT services for chat and images.
import Deva from '@indra.ai/deva';
import { OpenAI } from 'openai';
import pkg from './package.json' with {type:'json'};
const {agent,vars} = pkg.data;

import {methods} from './methods/index.js';
import {func} from './func/index.js';

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
  VLA: pkg.VLA,
  copyright: pkg.copyright,
};
const ChatDeva = new Deva({
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
    'chat:location'(packet) {
      this.vars.location = packet.data;
    },
    'chat:topic'(packet) {
      this.vars.topic = packet.data;
    },
  },
  modules: {
    openai: false,
  },
  func,
  methods,
  onInit(data, resolve) {
    const {personal} = this.license(); // get the license config
    const agent_license = this.info().VLA; // get agent license
    const license_check = this.license_check(personal, agent_license); // check license
    // return this.start if license_check passes otherwise stop.
    this.action('return', `onInit:${data.id.uid}`);
    return license_check ? this.start(data, resolve) : this.stop(data, resolve);
  },
  async onReady(data, resolve) {
    const {VLA} = this.info();
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

    this.prompt(`${this.vars.messages.ready} > VLA:${VLA.uid}`);
    this.action('resolve', `onReady:${data.id.uid}`);

    return resolve(data);
  },
  onFinish(data, resolve) {
    return this.complete(data, resolve);
  },
  onError(err) {
    this.prompt(this.vars.messages.error);
    console.log(err);
  }
});
export default ChatDeva
