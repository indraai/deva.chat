// Chat Deva Test File
// Copyright ©2000-2026 Quinn A Michaels; All rights reserved.
// Legal Signature Required For Lawful Use.
// Distributed under VLA:19412182866083041135 LICENSE.md
// Friday, January 30, 2026 - 12:14:59 PM

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
