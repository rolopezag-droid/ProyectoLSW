const test=require('node:test'),assert=require('node:assert/strict');
const {assess}=require('../public/news-context');
test('noticia muestra el evento adverso y no atribuye causalidad al precio',()=>{
 const result=assess({headline:'GF Securities Lowers Price Target on Dell Technologies',summary:'Concerns over spending slowdowns.'});
 assert.equal(result.label,'Posible sesgo bajista');assert.match(result.explanation,/lowers price target/);assert.match(result.explanation,/no la reacción efectiva/);
});
test('contexto favorable, mixto y ausente se distinguen',()=>{
 assert.equal(assess({headline:'Company raises guidance'}).label,'Posible sesgo alcista');
 assert.equal(assess({headline:'Company raises guidance despite losses'}).label,'Señales mixtas');
 assert.equal(assess({headline:'Company publishes annual calendar'}).label,'Sin dirección clara');
});
test('negación no se convierte en señal positiva',()=>{
 assert.equal(assess({headline:'Company fails to beat estimates',summary:'No revenue growth'}).label,'Sin dirección clara');
});
