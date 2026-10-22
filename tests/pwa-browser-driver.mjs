import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function pipeConnection(process) {
  const pending = new Map(), sessions = new Map(); let id = 0, buffer = ''
  process.stdio[4].setEncoding('utf8')
  process.stdio[4].on('data', (data) => {
    buffer += data.toString()
    let boundary
    while ((boundary = buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(buffer.slice(0,boundary)); buffer = buffer.slice(boundary+1)
      if (message.id && pending.has(message.id)) {
        const task = pending.get(message.id); pending.delete(message.id); clearTimeout(task.timeout)
        if(message.error)task.reject(new Error(task.method+': '+message.error.message));else task.resolve(message.result)
      } else if(message.method==='Runtime.exceptionThrown') sessions.get(message.sessionId)?.push(message.params.exceptionDetails.text)
    }
  })
  const command = (method, params = {}, sessionId) => new Promise((resolve,reject) => {
    const commandId=++id
    const timeout=setTimeout(()=>{pending.delete(commandId);reject(new Error(method+' timed out'))},25000)
    pending.set(commandId,{resolve,reject,timeout,method})
    process.stdio[3].write(JSON.stringify({id:commandId,method,params,...(sessionId?{sessionId}:{})})+'\0')
  })
  return { command, page: async (targetId) => {
    const { sessionId }=await command('Target.attachToTarget',{targetId,flatten:true})
    assert.ok(sessionId, 'CDPのページセッションがありません')
    const errors=[];sessions.set(sessionId,errors)
    return pageMethods((method,params)=>command(method,params,sessionId),errors)
  }, close:()=>{for(const task of pending.values())clearTimeout(task.timeout)} }
}

function pageMethods(command,errors) {
  const evaluate = async (expression) => {
    const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitFor = async (expression,message) => {
    for(let i=0;i<300;i++){
      try { if(await evaluate(`(async()=>Boolean(await (${expression})))()`))return }
      catch(error){if(!/context|navigat/i.test(error.message))throw error}
      await delay(50)
    }
    throw new Error(message+': '+await evaluate('document.body.innerText.slice(0,600)'))
  }
  const click=async(label)=>assert.equal(await evaluate(`(()=>{const buttons=[...document.querySelectorAll('button')],label=${JSON.stringify(label)};const button=buttons.find((button)=>button.textContent.trim()===label||button.getAttribute('aria-label')===label)??buttons.find((button)=>button.textContent.includes(label));if(!button||button.disabled)return false;button.click();return true})()`),true,label)
  const reload=async()=>{
    await evaluate('window.__pwaReloadMarker=true');await command('Page.reload')
    await waitFor("window.__pwaReloadMarker!==true && document.querySelector('.title-start') && !document.querySelector('.title-start').disabled",'再起動できません')
  }
  return {command,evaluate,waitFor,click,reload,errors,close:()=>{}}
}

export async function startBrowser(profileDirectory) {
  const path=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
  assert.ok(path,'ChromeまたはEdgeが必要です')
  // PWAのインストールAPIは、専用プロファイルへのローカルpipe接続でのみ使用する。
  const process=spawn(path,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-pipe',`--user-data-dir=${profileDirectory}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','ignore','pipe','pipe']})
  const connection=pipeConnection(process)
  await connection.command('Browser.getVersion')
  const {targetId}=await connection.command('Target.createTarget',{url:'about:blank'})
  const page=await connection.page(targetId)
  return {browser:connection,page,attach:connection.page,stop:async()=>{
    connection.close()
    if(process.exitCode===null){const exited=new Promise((resolve)=>process.once('exit',resolve));process.kill();await Promise.race([exited,delay(2000)])}
  }}
}
