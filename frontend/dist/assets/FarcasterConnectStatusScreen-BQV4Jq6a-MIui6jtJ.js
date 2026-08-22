import{o as e}from"./rolldown-runtime-C_s2cVnS.js";import{t}from"./react-DTjR_b-G.js";import{t as n}from"./jsx-runtime-Bbae7Wnw.js";import{t as r}from"./check-vK2tiAYS.js";import{t as i}from"./copy-D_eRKX9K.js";import{Bt as a,Et as o,Lt as s,S as c,k as l,xt as u,y as d}from"./useActiveWallet-Ch3qUtGV-CZHSbNGN.js";import{b as f,k as p}from"./context-BPa0mZTP-D_JIjJZI.js";import"./p256-I8nQXu20.js";import{t as m}from"./modal-context-BUYY7Raa-CMUhKJH1.js";import{t as h}from"./ModalHeader-prCgwil--BQte5Nr4.js";import{t as g}from"./ScreenLayout-VgDb5HVZ-BZkEwXWX.js";import"./index-DptWtMM8-DBNmeQhB.js";import{t as _}from"./shouldProceedtoEmbeddedWalletCreationFlow-BMOLoKU4-1EVMahXX.js";import{t as v}from"./browser-Df3JiI94.js";import{t as y}from"./QrCode-3mfrF4xV-DfzuF66L.js";import{t as b}from"./farcaster-DPlSjvF5-v6tg8jiz.js";import{t as x}from"./LabelXs-oqZNqbm_-DxHDalEl.js";import{t as S}from"./OpenLink-DZHy38vr-Ba-VnzhH.js";var C=n(),w=e(t(),1),T=e(c(),1);v();var E=s.div`
  width: 100%;
`,D=s.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem;
  height: 56px;
  background: ${e=>e.$disabled?`var(--privy-color-background-2)`:`var(--privy-color-background)`};
  border: 1px solid var(--privy-color-foreground-4);
  border-radius: var(--privy-border-radius-md);

  &:hover {
    border-color: ${e=>e.$disabled?`var(--privy-color-foreground-4)`:`var(--privy-color-foreground-3)`};
  }
`,O=s.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
`,k=s.span`
  display: block;
  font-size: 16px;
  line-height: 24px;
  color: ${e=>e.$disabled?`var(--privy-color-foreground-2)`:`var(--privy-color-foreground)`};
  overflow: hidden;
  text-overflow: ellipsis;
  /* Use single-line truncation without nowrap to respect container width */
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  word-break: break-all;

  @media (min-width: 441px) {
    font-size: 14px;
    line-height: 20px;
  }
`,A=s(k)`
  color: var(--privy-color-foreground-3);
  font-style: italic;
`,j=s(x)`
  margin-bottom: 0.5rem;
`,M=s(h)`
  && {
    gap: 0.375rem;
    font-size: 14px;
    flex-shrink: 0;
  }
`,N=({value:e,title:t,placeholder:n,className:a,showCopyButton:o=!0,truncate:s,maxLength:c=40,disabled:l=!1})=>{let[u,d]=(0,w.useState)(!1),f=s&&e?((e,t,n)=>{if((e=e.startsWith(`https://`)?e.slice(8):e).length<=n)return e;if(t===`middle`){let t=Math.ceil(n/2)-2,r=Math.floor(n/2)-1;return`${e.slice(0,t)}...${e.slice(-r)}`}return`${e.slice(0,n-3)}...`})(e,s,c):e;return(0,w.useEffect)((()=>{if(u){let e=setTimeout((()=>d(!1)),3e3);return()=>clearTimeout(e)}}),[u]),(0,C.jsxs)(E,{className:a,children:[t&&(0,C.jsx)(j,{children:t}),(0,C.jsxs)(D,{$disabled:l,children:[(0,C.jsx)(O,{children:e?(0,C.jsx)(k,{$disabled:l,title:e,children:f}):(0,C.jsx)(A,{$disabled:l,children:n||`No value`})}),o&&e&&(0,C.jsx)(M,{onClick:function(t){t.stopPropagation(),navigator.clipboard.writeText(e).then((()=>d(!0))).catch(console.error)},size:`sm`,children:(0,C.jsxs)(C.Fragment,u?{children:[`Copied`,(0,C.jsx)(r,{size:14})]}:{children:[`Copy`,(0,C.jsx)(i,{size:14})]})})]})]})},P=({connectUri:e,loading:t,success:n,errorMessage:r,onBack:i,onClose:a,onOpenFarcaster:o})=>(0,C.jsx)(g,T.isMobile||t?T.isIOS?{title:r?r.message:`Sign in with Farcaster`,subtitle:r?r.detail:`To sign in with Farcaster, please open the Farcaster app.`,icon:b,iconVariant:`loading`,iconLoadingStatus:{success:n,fail:!!r},primaryCta:e&&o?{label:`Open Farcaster app`,onClick:o}:void 0,onBack:i,onClose:a,watermark:!0}:{title:r?r.message:`Signing in with Farcaster`,subtitle:r?r.detail:`This should only take a moment`,icon:b,iconVariant:`loading`,iconLoadingStatus:{success:n,fail:!!r},onBack:i,onClose:a,watermark:!0,children:e&&T.isMobile&&(0,C.jsx)(I,{children:(0,C.jsx)(S,{text:`Take me to Farcaster`,url:e,color:`#8a63d2`})})}:{title:`Sign in with Farcaster`,subtitle:`Scan with your phone's camera to continue.`,onBack:i,onClose:a,watermark:!0,children:(0,C.jsxs)(L,{children:[(0,C.jsx)(R,{children:e?(0,C.jsx)(y,{url:e,size:275,squareLogoElement:b}):(0,C.jsx)(V,{children:(0,C.jsx)(d,{})})}),(0,C.jsxs)(z,{children:[(0,C.jsx)(B,{children:`Or copy this link and paste it into a phone browser to open the Farcaster app.`}),e&&(0,C.jsx)(N,{value:e,truncate:`end`,maxLength:30,showCopyButton:!0,disabled:!0})]})]})}),F={component:()=>{let{authenticated:e,logout:t,ready:n,user:r}=l(),{lastScreen:i,navigate:s,navigateBack:c,setModalData:d}=m(),h=p(),{getAuthFlow:g,loginWithFarcaster:v,closePrivyModal:y,createAnalyticsEvent:b}=a(),[x,S]=(0,w.useState)(void 0),[T,E]=(0,w.useState)(!1),[D,O]=(0,w.useState)(!1),k=(0,w.useRef)([]),A=g(),j=A?.meta.connectUri;return(0,w.useEffect)((()=>{let e=Date.now(),t=setInterval((async()=>{let n=await A.pollForReady.execute(),r=Date.now()-e;if(n){clearInterval(t),E(!0);try{await v(),O(!0)}catch(e){let t={retryable:!1,message:`Authentication failed`};if(e?.privyErrorCode===o.ALLOWLIST_REJECTED)return void s(`AllowlistRejectionScreen`);if(e?.privyErrorCode===o.USER_LIMIT_REACHED)return console.error(new u(e).toString()),void s(`UserLimitReachedScreen`);if(e?.privyErrorCode===o.USER_DOES_NOT_EXIST)return void s(`AccountNotFoundScreen`);if(e?.privyErrorCode===o.LINKED_TO_ANOTHER_USER)t.detail=e.message??`This account has already been linked to another user.`;else{if(e?.privyErrorCode===o.ACCOUNT_TRANSFER_REQUIRED&&e.data?.data?.nonce)return d({accountTransfer:{nonce:e.data?.data?.nonce,account:e.data?.data?.subject,displayName:e.data?.data?.account?.displayName,linkMethod:`farcaster`,embeddedWalletAddress:e.data?.data?.otherUser?.embeddedWalletAddress,farcasterEmbeddedAddress:e.data?.data?.otherUser?.farcasterEmbeddedAddress}}),void s(`LinkConflictScreen`);e?.privyErrorCode===o.INVALID_CREDENTIALS?(t.retryable=!0,t.detail=`Something went wrong. Try again.`):e?.privyErrorCode===o.TOO_MANY_REQUESTS&&(t.detail=`Too many requests. Please wait before trying again.`)}S(t)}}else r>12e4&&(clearInterval(t),S({retryable:!0,message:`Authentication failed`,detail:`The request timed out. Try again.`}))}),2e3);return()=>{clearInterval(t),k.current.forEach((e=>clearTimeout(e)))}}),[]),(0,w.useEffect)((()=>{if(n&&e&&D&&r){if(h?.legal.requireUsersAcceptTerms&&!r.hasAcceptedTerms){let e=setTimeout((()=>{s(`AffirmativeConsentScreen`)}),f);return()=>clearTimeout(e)}D&&(_(r,h.embeddedWallets)?k.current.push(setTimeout((()=>{d({createWallet:{onSuccess:()=>{},onFailure:e=>{console.error(e),b({eventName:`embedded_wallet_creation_failure_logout`,payload:{error:e,screen:`FarcasterConnectStatusScreen`}}),t()},callAuthOnSuccessOnClose:!0}}),s(`EmbeddedWalletOnAccountCreateScreen`)}),1400)):k.current.push(setTimeout((()=>y({shouldCallAuthOnSuccess:!0,isSuccess:!0})),1400)))}}),[D,n,e,r]),(0,C.jsx)(P,{connectUri:j,loading:T,success:D,errorMessage:x,onBack:i?c:void 0,onClose:y,onOpenFarcaster:()=>{j&&(window.location.href=j)}})}},I=s.div`
  margin-top: 24px;
`,L=s.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`,R=s.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 275px;
`,z=s.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`,B=s.div`
  font-size: 0.875rem;
  text-align: center;
  color: var(--privy-color-foreground-2);
`,V=s.div`
  position: relative;
  width: 82px;
  height: 82px;
`;export{F as FarcasterConnectStatusScreen,F as default,P as FarcasterConnectStatusView};