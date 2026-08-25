import{o as e}from"./rolldown-runtime-C_s2cVnS.js";import{t}from"./react-DTjR_b-G.js";import{t as n}from"./jsx-runtime-Bbae7Wnw.js";import{t as r}from"./createLucideIcon-SV0lVKKC.js";import{t as i}from"./credit-card-CbRXVd62.js";import{c as a,i as o,l as s,v as c}from"./styles-CSNNmiAA-UQCBK522.js";import{k as l}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~ko3ktu7r-D_JIjJZI.js";import"./p256-BVFPQJaI.js";import{i as u}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-D_vmucms.js";import{t as d}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-nm-tfA_f.js";import"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-CBUGobB9.js";import{t as f}from"./modal-context-BUYY7Raa-h_JJvk8H.js";import{r as p}from"./styles-DVyDvTdj-HVsn3dk9.js";import{p as m,v as h}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~k8y6wyky-DXGk8MiW.js";import"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~k8y6wyky-DT7Awr0a.js";var g=r(`banknote`,[[`rect`,{width:`20`,height:`12`,x:`2`,y:`6`,rx:`2`,key:`9lu3g6`}],[`circle`,{cx:`12`,cy:`12`,r:`2`,key:`1c9p78`}],[`path`,{d:`M6 12h.01M18 12h.01`,key:`113zkx`}]]),_=n(),v=e(t(),1);d();var y={component:()=>{let e=h(),{onUserCloseViaDialogOrKeybindRef:t}=f(),n=l(),r=(0,v.useRef)(!1);(0,v.useEffect)((()=>{e&&(r.current=!1)}),[e]);let u=(0,v.useCallback)((async()=>{!r.current&&e&&(r.current=!0,m(),await e.onCancel())}),[e]);return(0,v.useEffect)((()=>(t.current=u,()=>{t.current===u&&(t.current=null)})),[u,t]),e?e.error?(0,_.jsx)(a,{icon:g,iconVariant:`warning`,title:`Unable to add funds`,subtitle:e.error,showClose:!0,onClose:u,primaryCta:{label:`Close`,onClick:u}}):(0,_.jsx)(a,{icon:g,iconVariant:`subtle`,title:`Select method`,subtitle:`Choose how to fund your wallet`,showClose:!0,onClose:u,children:(0,_.jsxs)(p,{style:{marginTop:`1rem`},$colorScheme:n.appearance.palette.colorScheme,children:[e.startFiat&&(0,_.jsxs)(o,{onClick:async()=>{r.current||(r.current=!0,await e.startFiat?.())},children:[(0,_.jsx)(b,{children:(0,_.jsx)(i,{})}),(0,_.jsxs)(x,{children:[(0,_.jsx)(s,{children:`Pay with fiat`}),(0,_.jsx)(S,{children:`Apple Pay, Google Pay, or debit card`})]})]}),e.startCrypto&&(0,_.jsxs)(o,{onClick:async()=>{r.current||(r.current=!0,await e.startCrypto?.())},children:[(0,_.jsx)(b,{children:(0,_.jsx)(c,{})}),(0,_.jsxs)(x,{children:[(0,_.jsx)(s,{children:`Transfer from wallet`}),(0,_.jsx)(S,{children:`Send crypto from any wallet`})]})]})]})}):null}},b=u.span`
  width: 2rem;
  height: 2rem;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-2);
  color: var(--color-icon-muted, #64668b);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`,x=u.span`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`,S=u.span`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--privy-color-foreground-3);
`;export{y as AddFundsSelectionScreen,y as default};