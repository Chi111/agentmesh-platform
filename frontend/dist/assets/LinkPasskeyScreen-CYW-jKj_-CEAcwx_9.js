import{o as e,r as t}from"./rolldown-runtime-C_s2cVnS.js";import{t as n}from"./react-DTjR_b-G.js";import{t as r}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-CtPWb_3I.js";import"./eventemitter3-DQj0m2DI.js";import{t as i}from"./jsx-runtime-Bbae7Wnw.js";import{t as a}from"./createLucideIcon-SV0lVKKC.js";import{t as o}from"./circle-check-big-BiBD8fJ8.js";import{t as s}from"./fingerprint-pattern-CP18JHLS.js";import"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~ko3ktu7r-D_JIjJZI.js";import{i as c,r as l}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-A3UvPcnZ.js";import{Et as u,Ft as d,g as f,jt as p,k as m}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-q4xFQVxM.js";import{t as h}from"./modal-context-BUYY7Raa-DVYMU-Va.js";import{o as g}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~myf7jba1-BRrpusNA.js";import{t as _}from"./ScreenLayout-VgDb5HVZ-g8DQVoQW.js";import{n as v,t as y}from"./TodoList-CgrU7uwu-2VzMGu80.js";var b=a(`trash-2`,[[`path`,{d:`M10 11v6`,key:`nco0om`}],[`path`,{d:`M14 11v6`,key:`outv1u`}],[`path`,{d:`M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6`,key:`miytrc`}],[`path`,{d:`M3 6h18`,key:`d0wm0j`}],[`path`,{d:`M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2`,key:`e791ji`}]]),x=t({DoubleIconWrapper:()=>M,LinkButton:()=>P,LinkPasskeyScreen:()=>j,LinkPasskeyView:()=>w,default:()=>j}),S=i(),C=e(n(),1);r();var w=({passkeys:e,name:t,isLoading:n,errorReason:r,success:i,expanded:a,onLinkPasskey:c,onUnlinkPasskey:l,onExpand:u,onBack:d,onClose:f})=>i?(0,S.jsx)(_,{title:`Passkeys updated`,icon:o,iconVariant:`success`,primaryCta:{label:`Done`,onClick:f},onClose:f,watermark:!0}):a?(0,S.jsx)(_,{icon:s,title:`Your passkeys`,onBack:d,onClose:f,watermark:!0,children:(0,S.jsx)(k,{passkeys:e,expanded:a,onUnlink:l,onExpand:u})}):(0,S.jsxs)(_,{icon:s,title:`Set up passkey verification`,subtitle:`Verify with passkey`,primaryCta:{label:`Add new passkey`,onClick:c,loading:n},onClose:f,watermark:!0,helpText:r||void 0,children:[e.length===0?(0,S.jsx)(A,{}):(0,S.jsx)(T,{children:(0,S.jsx)(k,{passkeys:e,expanded:a,onUnlink:l,onExpand:u})}),t?(0,S.jsxs)(E,{children:[(0,S.jsx)(D,{children:`New Passkey Name`}),(0,S.jsx)(O,{children:t})]}):null]}),T=c.div`
  margin-bottom: 0.75rem;
`,E=c.div`
  margin-top: 0.25rem;
`,D=c.div`
  color: var(--privy-color-foreground-2);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1rem;
  margin-bottom: 0.25rem;
`,O=c.div`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  line-height: 1.25rem;
`,k=({passkeys:e,expanded:t,onUnlink:n,onExpand:r})=>{let[i,a]=(0,C.useState)([]),o=t?e.length:2;return(0,S.jsxs)(`div`,{children:[(0,S.jsx)(I,{children:`Your passkeys`}),(0,S.jsxs)(F,{children:[e.slice(0,o).map((e=>{return(0,S.jsxs)(z,{children:[(0,S.jsxs)(`div`,{children:[(0,S.jsx)(L,{children:(t=e,t.authenticatorName?t.createdWithBrowser?`${t.authenticatorName} on ${t.createdWithBrowser}`:t.authenticatorName:t.createdWithBrowser?t.createdWithOs?`${t.createdWithBrowser} on ${t.createdWithOs}`:`${t.createdWithBrowser}`:`Unknown device`)}),(0,S.jsxs)(R,{children:[`Last used:`,` `,(e.latestVerifiedAt??e.firstVerifiedAt)?.toLocaleString()??`N/A`]})]}),(0,S.jsx)(V,{disabled:i.includes(e.credentialId),onClick:()=>(async e=>{a((t=>t.concat([e]))),await n(e),a((t=>t.filter((t=>t!==e))))})(e.credentialId),children:i.includes(e.credentialId)?(0,S.jsx)(f,{}):(0,S.jsx)(b,{size:16})})]},e.credentialId);var t})),e.length>2&&!t&&(0,S.jsx)(P,{onClick:r,children:`View all`})]})]})},A=()=>(0,S.jsxs)(y,{style:{color:`var(--privy-color-foreground)`},children:[(0,S.jsx)(v,{children:`Verify with Touch ID, Face ID, PIN, or hardware key`}),(0,S.jsx)(v,{children:`Takes seconds to set up and use`}),(0,S.jsx)(v,{children:`Use your passkey to verify transactions and login to your account`})]}),j={component:()=>{let{user:e}=m(),{unlink:t}=g(),{linkWithPasskey:n,closePrivyModal:r}=d(),{data:i}=h(),a=e?.linkedAccounts.filter((e=>e.type===`passkey`)),[o,s]=(0,C.useState)(!1),[c,l]=(0,C.useState)(``),[f,_]=(0,C.useState)(!1),[v,y]=(0,C.useState)(!1);return(0,C.useEffect)((()=>{a.length===0&&y(!1)}),[a.length]),(0,S.jsx)(w,{passkeys:a,name:i?.passkeyAuthModalData?.name,isLoading:o,errorReason:c,success:f,expanded:v,onLinkPasskey:()=>{s(!0),n({name:i?.passkeyAuthModalData?.name}).then((()=>_(!0))).catch((e=>{if(e instanceof p){if(e.privyErrorCode===u.CANNOT_LINK_MORE_OF_TYPE)return void l(`Cannot link more passkeys to account.`);if(e.privyErrorCode===u.PASSKEY_NOT_ALLOWED)return void l(`Passkey request timed out or rejected by user.`)}l(`Unknown error occurred.`)})).finally((()=>{s(!1)}))},onUnlinkPasskey:async e=>(s(!0),await t({credentialId:e}).then((()=>_(!0))).catch((e=>{e instanceof p&&e.privyErrorCode===u.MISSING_MFA_CREDENTIALS?l(`Cannot unlink a passkey enrolled in MFA`):l(`Unknown error occurred.`)})).finally((()=>{s(!1)}))),onExpand:()=>y(!0),onBack:()=>y(!1),onClose:()=>r()})}},M=c.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 180px;
  height: 90px;
  border-radius: 50%;
  svg + svg {
    margin-left: 12px;
  }
  > svg {
    z-index: 2;
    color: var(--privy-color-accent) !important;
    stroke: var(--privy-color-accent) !important;
    fill: var(--privy-color-accent) !important;
  }
`,N=l`
  && {
    width: 100%;
    font-size: 0.875rem;
    line-height: 1rem;

    /* Tablet and Up */
    @media (min-width: 440px) {
      font-size: 14px;
    }

    display: flex;
    gap: 12px;
    justify-content: center;

    padding: 6px 8px;
    background-color: var(--privy-color-background);
    transition: background-color 200ms ease;
    color: var(--privy-color-accent) !important;

    :focus {
      outline: none;
      box-shadow: none;
    }
  }
`,P=c.button`
  ${N}
`,F=c.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.8rem;
  padding: 0.5rem 0rem 0rem;
  flex-grow: 1;
  width: 100%;
`,I=c.div`
  line-height: 20px;
  height: 20px;
  font-size: 1em;
  font-weight: 450;
  display: flex;
  justify-content: flex-beginning;
  width: 100%;
`,L=c.div`
  font-size: 1em;
  line-height: 1.3em;
  font-weight: 500;
  color: var(--privy-color-foreground-2);
  padding: 0.2em 0;
`,R=c.div`
  font-size: 0.875rem;
  line-height: 1rem;
  color: #64668b;
  padding: 0.2em 0;
`,z=c.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1em;
  gap: 10px;
  font-size: 0.875rem;
  line-height: 1rem;
  text-align: left;
  border-radius: 8px;
  border: 1px solid #e2e3f0 !important;
  width: 100%;
  height: 5em;
`,B=l`
  :focus,
  :hover,
  :active {
    outline: none;
  }
  display: flex;
  width: 2em;
  height: 2em;
  justify-content: center;
  align-items: center;
  svg {
    color: var(--privy-color-error);
  }
  svg:hover {
    color: var(--privy-color-foreground-3);
  }
`,V=c.button`
  ${B}
`;export{P as n,x as r,M as t};