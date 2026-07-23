// Chat Deva Test File
// Copyright ©2000-2026 Quinn Arjuna Michaels; All rights reserved.
// Owner Signature Required For Lawful Use.
// Distributed under VLA:27551750976737058274 LICENSE.md
// Tuesday, July 21, 2026 - 5:49:05 PM PST

const {expect} = require('chai')
const ChatDeva = require('./index.js');

describe(ChatDeva.me.name, () => {
  beforeEach(() => {
    return ChatDeva.init()
  });
  it('Check the DEVA Object', () => {
    expect(ChatDeva).to.be.an('object');
    expect(ChatDeva).to.have.property('agent');
    expect(ChatDeva).to.have.property('vars');
    expect(ChatDeva).to.have.property('listeners');
    expect(ChatDeva).to.have.property('methods');
    expect(ChatDeva).to.have.property('modules');
  });
})
