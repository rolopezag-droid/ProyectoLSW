async function checkService(svc, fetchImplementation = fetch) {
  const started = Date.now();
  try {
    const response = await fetchImplementation('http://127.0.0.1:'+svc.port+'/health', {signal:AbortSignal.timeout(2000)});
    const data = await response.json();
    const healthy = response.ok && data.service === svc.id && ['ok','OK'].includes(data.status);
    return {running:healthy,reachable:response.ok,latencyMs:Date.now()-started};
  } catch { return {running:false,reachable:false,latencyMs:Date.now()-started}; }
}
module.exports = {checkService};
