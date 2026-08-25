import{o as e}from"./rolldown-runtime-C_s2cVnS.js";import{t}from"./react-DTjR_b-G.js";import{t as n}from"./jsx-runtime-Bbae7Wnw.js";import{b as r,k as i}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~ko3ktu7r-D_JIjJZI.js";import"./p256-C3pUV2r-.js";import{i as a}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-Bwp7N8Lu.js";import{t as o}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-CEypVExx.js";import{Ft as s,b as c}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-CJibEvqg.js";import{t as l}from"./modal-context-BUYY7Raa-B13dqv2W.js";import{t as u}from"./ScreenLayout-VgDb5HVZ-CRV4kFxQ.js";import{t as d}from"./vendor~ConnectOrCreateScreen-DZ84slBi~FarcasterConnectStatusScreen-BQV4Jq6a~LandingScreen-D~jlak4xqv-Df3JiI94.js";import{t as f}from"./QrCode-3mfrF4xV-DKBAxL2U.js";import{t as p}from"./farcaster-DPlSjvF5-v6tg8jiz.js";import{t as m}from"./OpenLink-DZHy38vr-Dut_rYsu.js";import{t as h}from"./CopyToClipboard-DSTf_eKU-qf7CKXP-.js";var g=n(),_=e(t(),1),v=e(o(),1);d();var y=`#8a63d2`,b=({appName:e,loading:t,success:n,errorMessage:r,connectUri:i,onBack:a,onClose:o,onOpenFarcaster:s})=>(0,g.jsx)(u,v.isMobile||t?v.isIOS?{title:r?r.message:`Add a signer to Farcaster`,subtitle:r?r.detail:`This will allow ${e} to add casts, likes, follows, and more on your behalf.`,icon:p,iconVariant:`loading`,iconLoadingStatus:{success:n,fail:!!r},primaryCta:i&&s?{label:`Open Farcaster app`,onClick:s}:void 0,onBack:a,onClose:o,watermark:!0}:{title:r?r.message:`Requesting signer from Farcaster`,subtitle:r?r.detail:`This should only take a moment`,icon:p,iconVariant:`loading`,iconLoadingStatus:{success:n,fail:!!r},onBack:a,onClose:o,watermark:!0,children:i&&v.isMobile&&(0,g.jsx)(x,{children:(0,g.jsx)(m,{text:`Take me to Farcaster`,url:i,color:y})})}:{title:`Add a signer to Farcaster`,subtitle:`This will allow ${e} to add casts, likes, follows, and more on your behalf.`,onBack:a,onClose:o,watermark:!0,children:(0,g.jsxs)(S,{children:[(0,g.jsx)(C,{children:i?(0,g.jsx)(f,{url:i,size:275,squareLogoElement:p}):(0,g.jsx)(E,{children:(0,g.jsx)(c,{})})}),(0,g.jsxs)(w,{children:[(0,g.jsx)(T,{children:`Or copy this link and paste it into a phone browser to open the Farcaster app.`}),i&&(0,g.jsx)(h,{text:i,itemName:`link`,color:y})]})]})}),x=a.div`
  margin-top: 24px;
`,S=a.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`,C=a.div`
  padding: 24px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 275px;
`,w=a.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`,T=a.div`
  font-size: 0.875rem;
  text-align: center;
  color: var(--privy-color-foreground-2);
`,E=a.div`
  position: relative;
  width: 82px;
  height: 82px;
`,D={component:()=>{let{lastScreen:e,navigateBack:t,data:n}=l(),a=i(),{requestFarcasterSignerStatus:o,closePrivyModal:c}=s(),[u,d]=(0,_.useState)(void 0),[f,p]=(0,_.useState)(!1),[m,h]=(0,_.useState)(!1),v=(0,_.useRef)([]),y=n?.farcasterSigner;(0,_.useEffect)((()=>{let e=Date.now(),t=setInterval((async()=>{if(!y?.public_key)return clearInterval(t),void d({retryable:!0,message:`Connect failed`,detail:`Something went wrong. Please try again.`});y.status===`approved`&&(clearInterval(t),p(!1),h(!0),v.current.push(setTimeout((()=>c({shouldCallAuthOnSuccess:!1,isSuccess:!0})),1400)));let n=await o(y?.public_key),i=Date.now()-e;n.status===`approved`?(clearInterval(t),p(!1),h(!0),v.current.push(setTimeout((()=>c({shouldCallAuthOnSuccess:!1,isSuccess:!0})),r))):i>3e5?(clearInterval(t),d({retryable:!0,message:`Connect failed`,detail:`The request timed out. Try again.`})):n.status===`revoked`&&(clearInterval(t),d({retryable:!0,message:`Request rejected`,detail:`The request was rejected. Please try again.`}))}),2e3);return()=>{clearInterval(t),v.current.forEach((e=>clearTimeout(e)))}}),[]);let x=y?.status===`pending_approval`?y.signer_approval_url:void 0;return(0,g.jsx)(b,{appName:a.name,loading:f,success:m,errorMessage:u,connectUri:x,onBack:e?t:void 0,onClose:c,onOpenFarcaster:()=>{x&&(window.location.href=x)}})}};export{D as FarcasterSignerStatusScreen,D as default,b as FarcasterSignerStatusView};