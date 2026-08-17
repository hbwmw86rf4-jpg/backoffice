const xml2js = require('xml2js');
const parser = new xml2js.Parser({
  explicitArray: false,
  mergeAttrs: true,
  attrkey: '$',
  charkey: '_'
});

parser.parseString('<TransactionLine status="voided"><ItemLine><Description>Test</Description></ItemLine></TransactionLine>', (err, res) => {
  console.log(JSON.stringify(res, null, 2));
});
