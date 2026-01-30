"use strict";
// Chat Deva Methods
// Copyright ©2000-2026 Quinn A Michaels; All rights reserved.
// Legal Signature Required For Lawful Use.
// Distributed under VLA:19412182866083041135 LICENSE.md
// Friday, January 30, 2026 - 12:14:59 PM

export const methods = {
	/**************
	method: chat
	params: packet
	describe: send a chat to oepnai
	***************/
	chat(packet) {
		this.context('chat', `${this.vars.provider}:${packet.q.agent.profile.name}`);
		this.action('method', `chat:${this.vars.provider}`);
	
		return new Promise((resolve, reject) => {
			if (!packet) return (`chat: ${this._messages.nopacket}`);
			const {params} = packet.q.meta;
			if (params[1]) this.vars.provider = params[1];
	
			packet.q.agent = this.agent();
			const data = {};
	
			this.func.chat(packet).then(chat => {
				data.chat = chat;
				const response = [
					`::begin:${this.vars.provider}:${packet.id.uid}`,
					this.utils.parse(chat.text),
					`date: ${this.lib.formatDate(Date.now(), 'long', true)}`,
					`::end:${this.vars.provider}:${this.hash(chat.text)}`,
				].join('\n');
				this.state('parse', `chat:${this.vars.provider}`);
				return this.question(`${this.askChr}feecting parse ${response}`);
			}).then(feecting => {
				data.feecting = feecting.a.data;
				this.action('resolve', `chat:${this.vars.provider}`);
				return resolve({
					text:feecting.a.text,
					html: feecting.a.html,
					data,
				});
			}).catch(err => {
				this.state('reject', `chat:${this.vars.provider}`);
				console.log('chat error', err);
				return this.err(err, packet, reject);
			})
		});
	},
	
	/**************
	method: relay
	params: packet
	describe: send a relay to oepnai without a formatted return.
	***************/
	relay(packet) {
		const {id,q} = packet;
		const { meta, text } = q;
		const role = meta.params[1] || false;
		const data = {};
		return new Promise((resolve, reject) => {
			if (!packet) return resolve(`relay: ${this._messages.nopacket}`);
			if (!text) return resolve(this._messages.notext);
	
			this.context('relay', `chat:${id.uid}`);
			this.action('method', `relay:${id.uid}`);
	
			this.func.chat(packet).then(chat => {
				data.parsed = this.utils.parse(chat.text);
				data.chat = chat;
				this.action('resolve', `relay:${id.uid}`);
				this.state('valid', `relay:${id.uid}`);
				this.intent('good', `relay:${id.uid}`);
	
				return resolve({
					text: this.utils.parse(chat.text),
					html: false,
					data,
				});
			}).catch(err => {
				this.action('reject', `relay:${id.uid}`);
				this.state('invalid', `relay:${id.uid}`);
				this.intent('bad', `relay:${id.uid}`);
				return this.err(err, packet, reject);
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
	
}