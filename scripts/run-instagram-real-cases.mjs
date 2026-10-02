const CASES=[
  {name:'Reel',url:'https://www.instagram.com/reel/DaszqnpoLCl/?igsh=MTY0Z3l3OWU5MzU1dw=='},
  {name:'Carousel slide 2',url:'https://www.instagram.com/p/Db7z448jYex/?img_index=2&igsh=MWtvejAyaHZ3Y2V0aQ=='}
]
const base=String(process.env.NOTE2_GATEWAY_URL||'http://127.0.0.1:8080').replace(/\/$/,'')
const token=String(process.env.NOTE2_SESSION_TOKEN||'').trim()
const headers={'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})}
let failed=0
for(const item of CASES){
  console.log(`\n=== ${item.name} ===`)
  console.log(item.url)
  try{
    const response=await fetch(`${base}/api/instagram`,{method:'POST',headers,body:JSON.stringify({url:item.url})})
    const data=await response.json().catch(()=>({}))
    console.log('HTTP',response.status)
    if(!response.ok){console.log('ERROR',data.error||'unknown');failed++;continue}
    console.log(JSON.stringify({shortcode:data.shortcode,url:data.url,routeType:data.requestContext?.routeType,requestedMediaIndex:data.requestContext?.requestedMediaIndex,owner:data.owner?.username||'',captionChars:(data.caption||'').length,media:(data.media||[]).map(x=>({index:x.index,kind:x.kind,bytes:x.bytes,width:x.width,height:x.height}))},null,2))
  }catch(error){failed++;console.log('ERROR',error.message)}
}
process.exitCode=failed?1:0
