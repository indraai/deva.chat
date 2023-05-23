// Copyright (c)2023 Quinn Michaels
// OpenAI Deva test file

const {expect} = require('chai')
const oai = require('./index.js');

describe(oai.me.name, () => {
  beforeEach(() => {
    return oai.init()
  });
  it('Check the DEVA Object', () => {
    expect(oai).to.be.an('object');
    expect(oai).to.have.property('agent');
    expect(oai).to.have.property('vars');
    expect(oai).to.have.property('listeners');
    expect(oai).to.have.property('methods');
    expect(oai).to.have.property('modules');
  });
})
