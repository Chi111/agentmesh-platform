import{o as e}from"./rolldown-runtime-C_s2cVnS.js";import{t}from"./react-DTjR_b-G.js";import"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~k8y6wyky-CA1oh4KU.js";import{t as n}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-CtPWb_3I.js";import"./eventemitter3-DQj0m2DI.js";import{t as r}from"./jsx-runtime-Bbae7Wnw.js";import{t as i}from"./createLucideIcon-SV0lVKKC.js";import{t as a}from"./credit-card-CbRXVd62.js";import{c as o,i as s,l as c,v as l}from"./styles-CSNNmiAA-B4l_njS1.js";import{k as u}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~ko3ktu7r-D_JIjJZI.js";import{i as d}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-A3UvPcnZ.js";import"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-CBUGobB9.js";import{t as f}from"./modal-context-BUYY7Raa-DVYMU-Va.js";import{r as p}from"./styles-DVyDvTdj--bD9MTWE.js";import{p as m,v as h}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~k8y6wyky-CGmxmP0F.js";var g=i(`banknote`,[[`rect`,{width:`20`,height:`12`,x:`2`,y:`6`,rx:`2`,key:`9lu3g6`}],[`circle`,{cx:`12`,cy:`12`,r:`2`,key:`1c9p78`}],[`path`,{d:`M6 12h.01M18 12h.01`,key:`113zkx`}]]),_=r(),v=e(t(),1);n();var y={component:()=>{let e=h(),{onUserCloseViaDialogOrKeybindRef:t}=f(),n=u(),r=(0,v.useRef)(!1);(0,v.useEffect)((()=>{e&&(r.current=!1)}),[e]);let i=(0,v.useCallback)((async()=>{!r.current&&e&&(r.current=!0,m(),await e.onCancel())}),[e]);return(0,v.useEffect)((()=>(t.current=i,()=>{t.current===i&&(t.current=null)})),[i,t]),e?e.error?(0,_.jsx)(o,{icon:g,iconVariant:`warning`,title:`Unable to add funds`,subtitle:e.error,showClose:!0,onClose:i,primaryCta:{label:`Close`,onClick:i}}):(0,_.jsx)(o,{icon:g,iconVariant:`subtle`,title:`Select method`,subtitle:`Choose how to fund your wallet`,showClose:!0,onClose:i,children:(0,_.jsxs)(p,{style:{marginTop:`1rem`},$colorScheme:n.appearance.palette.colorScheme,children:[e.startFiat&&(0,_.jsxs)(s,{onClick:async()=>{r.current||(r.current=!0,await e.startFiat?.())},children:[(0,_.jsx)(b,{children:(0,_.jsx)(a,{})}),(0,_.jsxs)(x,{children:[(0,_.jsx)(c,{children:`Pay with fiat`}),(0,_.jsx)(S,{children:`Apple Pay, Google Pay, or debit card`})]})]}),e.startCrypto&&(0,_.jsxs)(s,{onClick:async()=>{r.current||(r.current=!0,await e.startCrypto?.())},children:[(0,_.jsx)(b,{children:(0,_.jsx)(l,{})}),(0,_.jsxs)(x,{children:[(0,_.jsx)(c,{children:`Transfer from wallet`}),(0,_.jsx)(S,{children:`Send crypto from any wallet`})]})]})]})}):null}},b=d.span`
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
`,x=d.span`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`,S=d.span`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--privy-color-foreground-3);
`;export{y as AddFundsSelectionScreen,y as default};