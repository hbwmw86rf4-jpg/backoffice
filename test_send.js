
const { sendAllPendingChanges } = require('./src/exporters/pos_sender.js');
const res = sendAllPendingChanges();
console.log('Node Result:', res);
