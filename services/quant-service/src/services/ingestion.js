const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
function createIngestor(broker,directory=path.resolve(__dirname,'../../../../.local-data/ingestions')) {
  return {async run(input={}) {
    const {symbol,expiration,type}=input;
    if(typeof symbol!=='string'||!/^[A-Z0-9.-]{1,20}$/i.test(symbol)||typeof expiration!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(expiration)||!Number.isFinite(Date.parse(expiration))||new Date(expiration).toISOString().slice(0,10)!==expiration) {const e=new Error('Se requieren symbol y expiration válidos.');e.status=400;throw e;}
    const contracts=new Map(),tokens=new Set();let pageToken,pages=0;
    do {
      if(pages>=50){const e=new Error('Ingestión incompleta: superó 50 páginas.');e.status=502;throw e;}
      const page=await broker.getOptionChain({symbol,expiration,type,pageToken,limit:1000});pages++;
      for(const c of page.contracts) contracts.set(c.contractSymbol,c);
      pageToken=page.nextPageToken;
      if(pageToken&&tokens.has(pageToken)){const e=new Error('Alpaca repitió el token de paginación.');e.status=502;throw e;}tokens.add(pageToken);
    }while(pageToken);
    const id=randomUUID(),record={ingestionId:id,status:'completed',provider:'alpaca',storage:'local-file',symbol:symbol.toUpperCase(),expiration,type:type||null,pages,counts:{received:contracts.size,normalized:contracts.size,rejected:0},createdAt:new Date().toISOString(),contracts:[...contracts.values()]};
    await fs.mkdir(directory,{recursive:true});
    const temp=path.join(directory,id+'.tmp'),dest=path.join(directory,id+'.json');
    try {await fs.writeFile(temp,JSON.stringify(record),{flag:'wx'});await fs.rename(temp,dest);}catch(error){await fs.rm(temp,{force:true});throw error;}
    return record;
  },async read(id) {
    if(!/^[a-f0-9-]{36}$/.test(id)){const e=new Error('ID de ingestión inválido.');e.status=400;throw e;}
    try{return JSON.parse(await fs.readFile(path.join(directory,id+'.json'),'utf8'));}catch(error){if(error.code==='ENOENT'){error.status=404;error.message='Ingestión no encontrada.';}throw error;}
  }};
}
module.exports={createIngestor};
