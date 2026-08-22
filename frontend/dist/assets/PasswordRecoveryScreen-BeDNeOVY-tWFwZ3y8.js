import{o as e}from"./rolldown-runtime-C_s2cVnS.js";import{t}from"./react-DTjR_b-G.js";import{t as n}from"./jsx-runtime-Bbae7Wnw.js";import{Bt as r,C as i,It as a,Lt as o,Mt as s,S as c,k as l}from"./useActiveWallet-Ch3qUtGV-CZHSbNGN.js";import"./context-BPa0mZTP-D_JIjJZI.js";import"./p256-I8nQXu20.js";import{t as u}from"./modal-context-BUYY7Raa-CMUhKJH1.js";import{l as d}from"./ModalHeader-prCgwil--BQte5Nr4.js";import{t as f}from"./Screen-BSnRr8gp-DQOUZx5P.js";import{x as p}from"./index-DptWtMM8-DBNmeQhB.js";import{a as m,d as h,n as g,o as _,s as v}from"./shared-D00Xz_xA-C_jSz5Ox.js";import{t as y}from"./ShieldCheckIcon-q__f5b22.js";import{a as b}from"./Layouts-BlFm53ED-DGxRw7Zq.js";var x=n(),S=e(t(),1);c();var C={component:()=>{let[e,t]=(0,S.useState)(!0),{authenticated:n,user:a}=l(),{walletProxy:o,closePrivyModal:c,createAnalyticsEvent:d,client:C}=r(),{navigate:D,data:O,onUserCloseViaDialogOrKeybindRef:k}=u(),[A,j]=(0,S.useState)(void 0),[M,N]=(0,S.useState)(``),[P,F]=(0,S.useState)(!1),{entropyId:I,entropyIdVerifier:L,onCompleteNavigateTo:R,onSuccess:z,onFailure:B}=O.recoverWallet,V=(e=`User exited before their wallet could be recovered`)=>{c({shouldCallAuthOnSuccess:!1}),B(typeof e==`string`?new s(e):e)};return k.current=V,(0,S.useEffect)((()=>{if(!n)return V(`User must be authenticated and have a Privy wallet before it can be recovered`)}),[n]),(0,x.jsxs)(f,{children:[(0,x.jsx)(f.Header,{icon:y,title:`Enter your password`,subtitle:`Please provision your account on this new device. To continue, enter your recovery password.`,showClose:!0,onClose:V}),(0,x.jsx)(f.Body,{children:(0,x.jsx)(w,{children:(0,x.jsxs)(`div`,{children:[(0,x.jsxs)(m,{children:[(0,x.jsx)(_,{type:e?`password`:`text`,onChange:e=>(e=>{e&&j(e)})(e.target.value),disabled:P,style:{paddingRight:`2.3rem`}}),(0,x.jsx)(h,{style:{right:`0.75rem`},children:e?(0,x.jsx)(g,{onClick:()=>t(!1)}):(0,x.jsx)(v,{onClick:()=>t(!0)})})]}),!!M&&(0,x.jsx)(T,{children:M})]})})}),(0,x.jsxs)(f.Footer,{children:[(0,x.jsx)(f.HelpText,{children:(0,x.jsxs)(b,{children:[(0,x.jsx)(`h4`,{children:`Why is this necessary?`}),(0,x.jsx)(`p`,{children:`You previously set a password for this wallet. This helps ensure only you can access it`})]})}),(0,x.jsx)(f.Actions,{children:(0,x.jsx)(E,{loading:P||!o,disabled:!A,onClick:async()=>{F(!0);let e=await C.getAccessToken(),t=i(a,I);if(!e||!t||A===null)return V(`User must be authenticated and have a Privy wallet before it can be recovered`);try{d({eventName:`embedded_wallet_recovery_started`,payload:{walletAddress:t.address}}),await o?.recover({accessToken:e,entropyId:I,entropyIdVerifier:L,recoveryPassword:A}),N(``),R?D(R):c({shouldCallAuthOnSuccess:!1}),z?.(t),d({eventName:`embedded_wallet_recovery_completed`,payload:{walletAddress:t.address}})}catch(e){p(e)?N(`Invalid recovery password, please try again.`):N(`An error has occurred, please try again.`)}finally{F(!1)}},$hideAnimations:!I&&P,children:`Recover your account`})}),(0,x.jsx)(f.Watermark,{})]})]})}},w=o.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`,T=o.div`
  line-height: 20px;
  height: 20px;
  font-size: 13px;
  color: var(--privy-color-error);
  text-align: left;
  margin-top: 0.5rem;
`,E=o(d)`
  ${({$hideAnimations:e})=>e&&a`
      && {
        // Remove animations because the recoverWallet task on the iframe partially
        // blocks the renderer, so the animation stutters and doesn't look good
        transition: none;
      }
    `}
`;export{C as PasswordRecoveryScreen,C as default};