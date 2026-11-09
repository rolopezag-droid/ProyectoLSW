'use strict';
const input=require('./spread-input');
const MAX_SNAPSHOT_BYTES=200_000;
class ResearchJournalService {
  constructor(db,userId){this.db=db;this.userId=userId;}
  writer(){if(!this.userId)input.fail('Se requiere una sesión de Supabase.',401);}
  async list({limit=30,skip=0}={}){
    this.writer(); limit=Number(limit);skip=Number(skip);
    if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(skip)||skip<0)input.fail('Paginación inválida.');
    const {data,error,count}=await this.db.from('research_journal').select('id,user_id,underlying_ticker,expiration_date,created_at,snapshot',{count:'exact'}).eq('user_id',this.userId).order('created_at',{ascending:false}).range(skip,skip+limit-1);
    if(error)throw Object.assign(new Error(error.code==='42P01'?'Falta aplicar la migración Supabase del diario de análisis.':'No se pudo consultar la bitácora en Supabase.'),{status:error.code==='42P01'?503:error.code==='42501'?403:502});
    return {data:data||[],total:count||0,limit,skip};
  }
  async create(value){
    this.writer();input.object(value);
    if(Object.keys(value).some(k=>!['underlyingTicker','expirationDate','snapshot'].includes(k)))input.fail('La bitácora solo admite ticker, vencimiento y snapshot.');
    const ticker=String(value.underlyingTicker||'').trim().toUpperCase();
    if(!/^[A-Z0-9.-]{1,12}$/.test(ticker))input.fail('underlyingTicker debe ser un ticker válido.');
    input.date(value.expirationDate);
    if(!value.snapshot||typeof value.snapshot!=='object'||Array.isArray(value.snapshot))input.fail('snapshot debe ser un objeto JSON.');
    const serialized=JSON.stringify(value.snapshot);
    if(Buffer.byteLength(serialized,'utf8')>MAX_SNAPSHOT_BYTES)input.fail('El snapshot excede el límite de 200 KB.');
    const {data,error}=await this.db.from('research_journal').insert({user_id:this.userId,underlying_ticker:ticker,expiration_date:value.expirationDate,snapshot:value.snapshot}).select('id,user_id,underlying_ticker,expiration_date,created_at,snapshot').single();
    if(error)throw Object.assign(new Error(error.code==='42P01'?'Falta aplicar la migración Supabase del diario de análisis.':'No se pudo guardar la bitácora en Supabase.'),{status:error.code==='42P01'?503:error.code==='42501'?403:error.code==='23514'?400:502});
    return data;
  }
}
module.exports={ResearchJournalService};
