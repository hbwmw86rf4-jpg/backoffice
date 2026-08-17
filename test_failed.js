const { importXmlFile } = require('./src/importers/xml_parser');

async function test() {
  const file = '\\\\10.5.48.2\\XMLGateway\\BOOutBox\\PJR3402608151936415138459.xml';
  try {
    const res = await importXmlFile(file);
    console.log(res);
  } catch (e) {
    console.error(e);
  }
}

test();
