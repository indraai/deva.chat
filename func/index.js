"use strict";
// Chat Deva Functions
// Copyright ©2000-2026 Quinn A Michaels; All rights reserved.
// Legal Signature Required For Lawful Use.
// Distributed under VLA:19412182866083041135 LICENSE.md
// Friday, January 30, 2026 - 12:14:59 PM

export const func = {
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
		this.action('func', `chat:${opts.id.uid}`);
	
		this.state('const', `chat:${opts.id.uid}`); // set state $1      
		const {id, q} = opts;
		const {options,tools} = this.vars.chat;
		const serv = this.modules[this.vars.provider];
	
		const content = [
			`${this.box.begin}:${this.vars.provider}:${id.uid}`,
			`prompt: ${opts.q.text}`,
			`uid: ${id.uid}`,
			`date: ${id.date}`,
			`fingerprint: ${id.fingerprint}`,
			`copyright: ${id.copyright}`,
			`${this.box.end}:${this.vars.provider}:${id.uid}`
		].join('\n')
		const _hist = {
			role: options.role,
			content,
		};
		
		this.vars.history.push(_hist); // push history record into vars.
		
		const messages = q.data.history || this.vars.history.slice(-10); // gather the 5 latest history items.
		
		// set the corpus at the top of the request if one exists.
		if (q.data.corpus) {
			this.prompt(`Set Chat Corpus`);
			this.state('set', `chat:corpus:${id.uid}`);
			messages.unshift({role: 'system', content: q.data.corpus});
		}
	
		// set the header before the corpus if provided
		if (q.data.header) {
			this.prompt(`hit the header marker`);
			this.state('set', `chat:header:${id.uid}`);
			messages.unshift({role: 'system', content: q.data.header});
		}
	
		// set the provider model
		this.state('set', `chat:model:${id.uid}`);
		const model = this.vars.chat.models[this.vars.provider];
	
		// set the chat request parameters
		this.state('set', `chat:params:${id.uid}`);
		const params = {
			model,
			n: options.n,
			messages,
			// temperature: options.temperature,
			// top_p: options.top_p,
			// frequency_penalty: options.frequency_penalty,
			// presence_penalty: options.presence_penalty,
			// tools: this.lib.copy(tools),
		};
	
		if (q.data.max_tokens) {
			this.state('set', `chat:tokens:${opts.data.max_tokens}:${id.uid}`);
			params.max_tokens = opts.data.max_tokens;
		}
	
		const memkey = q.data.memory || q.agent.key; // set memory key for agent memory lookup
	
		this.state('let', `chat:${id.uid}`);
		let chat = false;
		this.state('try', `chat:completion:${id.uid}`);
		try {
			this.state('await', `chat:${id.uid}`);
			chat = await serv.chat.completions.create(params)      
		}
		catch(err) {
			this.state('catch', `chat:completion:${id.uid}`);
			this.intent('bad', `chat:completion:${id.uid}`);
			return this.err(err, opts, false);
		}
	
		const {tool_calls} = chat.choices[0].message;
		let data = false;
		// call the tool_calls function if the response triggers a match.
		if (tool_calls) {
			this.func.tool_calls({opts,chat});
		}
		// else run the default chat response if there is no tool cals.
		else {
			this.state('set', `chat:data:${id.uid}`);
			data = {
				id,
				chatid: chat.id,
				model: chat.model,
				usage: chat.usage,
				role: chat.choices[0].message.role,
				text: this.utils.process(chat.choices[0].message.content),
				created: chat.created,
			}
	
			this.action('hash', `chat:md5:${id.uid}`); // set action hash
			this.hash(data, 'md5');
			this.action('hash', `chat:sha256:${id.uid}`); // set action hash
			this.hash(data, 'sha256');
			this.action('hash', `chat:sha512:${id.uid}`); // set action hash
			this.hash(data, 'sha512');
	
			this.state('set', `chat:response:${id.uid}`); // set response state
			this.vars.response = this.lib.copy(data);
	
			// push local history if no agent history in q data.
			if (!q.data.history) this.vars.history.push({
				role: data.role,
				content: data.text,
			});
		}
		// memory event
		this.state('set', `chat:memorydata:${id.uid}`); // set state set
		const memorydata = {
			id: chat.id,
			client: q.client,
			agent: q.agent,
			q: q.text,
			a: data.text,
			chat,
			created: Date.now(),
		}
		this.action('hash', `chat:md5:${id.uid}`); // set action hash
		memorydata.md5 = this.hash(memorydata, 'md5');
		this.action('hash', `chat:sha256:${id.uid}`); // set action hash
		memorydata.sha256 = this.hash(memorydata, 'sha256');
		this.action('hash',  `chat:sha512:${id.uid}`); // set action hash
		memorydata.sha512 = this.hash(memorydata, 'sha512');
		
		this.action('talk', `chat:memorydata:${id.uid}`); // set action talk
		this.talk('data:memory', memorydata);
		
		this.action('return', `chat:data:${id.uid}`);
		return data;
	},
	
	async tool_calls(chat) {
		this.state('set', `chat:tools:${id.uid}`);
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
		
		this.state('set', `chat:second:${id.uid}`);
		const second_params = {
			model,
			n: options.n,
			messages,
			temperature: options.temperature,
			top_p: options.top_p,
			frequency_penalty: options.frequency_penalty,
			presence_penalty: options.presence_penalty,
		};
		
		this.state('await', `chat:second:${id.uid}`);
		const second_chat = await serv.chat.completions.create(second_params);
		data = {
			id: second_chat.id,
			model: second_chat.model,
			usage: second_chat.usage,
			role: second_chat.choices[0].message.role,
			text: second_chat.choices[0].message.content,
			created: second_chat.created,
		}
		data.hash = this.hash(data);
		
		this.state('set', `response:${data.id}`); // set response state
		this.vars.response = this.lib.copy(data);
		if (!q.data.history) this.vars.history.push({
			role: data.role,
			content: data.text,
		});		
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
				data.hash = this.hash(data);
	
				const jsonFile = this.lib.path.join(basePath, 'main.json')
				// first we need to read the json file if there is one. 
				if (!this.lib.fs.existsSync(jsonFile)) {
					const json = {images:[]}
					this.lib.fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2), {encoding:'utf8'});
				}
				const jsonData = JSON.parse(this.lib.fs.readFileSync(jsonFile, 'utf8'));
				jsonData.images.push(data);
	
				this.lib.fs.writeFileSync(jsonFile, JSON.stringify(jsonData, null, 2), {encoding:'utf8',flag:'w'})
	
				this.action('resolve', 'image')
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
	}
}