import{o as e}from"./rolldown-runtime-C_s2cVnS.js";import{t}from"./react-DTjR_b-G.js";import{t as n}from"./jsx-runtime-Bbae7Wnw.js";import{t as r}from"./createLucideIcon-SV0lVKKC.js";import{t as i}from"./check-vK2tiAYS.js";import{t as a}from"./chevron-down-B_0iEnR0.js";import{t as o}from"./hourglass-C2nLWkoo.js";import{_ as s,a as c,c as l,d as u,f as d,g as f,h as p,i as m,l as h,m as g,n as _,o as v,p as y,r as b,s as x,t as S,u as C,v as w}from"./styles-CSNNmiAA-DAWFFlGc.js";import{t as T}from"./triangle-alert-BnS_4BrR.js";import{C as ee,H as te,Kt as ne,Rt as E,Tr as D,Vt as O,b as re,ln as k}from"./useActiveWallet-Ch3qUtGV-KS612z6P.js";import"./context-BPa0mZTP-D_JIjJZI.js";import"./p256-I8nQXu20.js";import{t as ie}from"./modal-context-BUYY7Raa-CyiqG7V1.js";import{l as ae}from"./ModalHeader-prCgwil--kFrDqgZG.js";import{t as A}from"./ScreenLayout-VgDb5HVZ-C9GYFRpi.js";import{r as j}from"./styles-DVyDvTdj-mYL4KlqG.js";import{i as oe,r as se,s as ce,t as le}from"./floating-ui.react-dom-Bt7PdD_r.js";import{a as ue,c as de,d as fe,f as M,i as N,o as P,r as F,s as I,t as L,u as R}from"./floating-ui.react-BBKxiDL0.js";import{i as z,n as B,t as V}from"./use-deposit-address-RxE86-z2-CyLIoyiB.js";import{n as pe}from"./CopyableText-CQapvaMr-Dd8ySFKs.js";import{t as me}from"./browser-Df3JiI94.js";import{t as he}from"./QrCode-3mfrF4xV-BwZd6mDt.js";var ge=r(`chevron-up`,[[`path`,{d:`m18 15-6-6-6 6`,key:`153udz`}]]),_e=r(`info`,[[`circle`,{cx:`12`,cy:`12`,r:`10`,key:`1mglay`}],[`path`,{d:`M12 16v-4`,key:`1dtifu`}],[`path`,{d:`M12 8h.01`,key:`e9boi3`}]]),ve=r(`undo-2`,[[`path`,{d:`M9 14 4 9l5-5`,key:`102s5s`}],[`path`,{d:`M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11`,key:`f3b9sd`}]]),H=n(),U=e(t(),1);ee(),me();var ye=class extends U.Component{static getDerivedStateFromError(){return{hasError:!0}}componentDidCatch(e,t){this.props.onError(e)}componentDidUpdate(e){e.resetKey!==this.props.resetKey&&this.state.hasError&&this.setState({hasError:!1})}render(){return this.state.hasError?null:this.props.children}constructor(...e){super(...e),this.state={hasError:!1}}};function be(e,t,n){let r=Number(e);return!Number.isFinite(r)||r===0?`1 ${t} ≈ ${e} ${n}`:r>=.01?`1 ${t} ≈ ${W(r)} ${n}`:`${W(1/r)} ${t} ≈ 1 ${n}`}function W(e){return e>=1e3?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:0}).format(Math.round(e)):e>=100?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:1}).format(e):e>=1?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:2}).format(e):new Intl.NumberFormat(`en-US`,{maximumFractionDigits:4}).format(e)}function G(e,t){let n=Number(e);if(!Number.isFinite(n)||n===0)return e;let r=t==null?n:n/10**t;return r>=1e3?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:2}).format(r):r>=1?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:4}).format(r):r>=1e-4?new Intl.NumberFormat(`en-US`,{maximumFractionDigits:6}).format(r):new Intl.NumberFormat(`en-US`,{maximumSignificantDigits:4}).format(r)}function K({address:e,caip2:t,config:n}){for(let r of n.currencies){let n=r.chains.find((n=>n.caip2===t&&n.address.toLowerCase()===e.toLowerCase()));if(n)return{symbol:r.symbol.toUpperCase(),decimals:n.decimals}}return{symbol:e,decimals:void 0}}function q(e,t){return t[e]?.displayName??e}function J(e,t){return e.chains.filter((e=>!0===e.can_be_relay_deposit_source)).map((e=>{let n=t.chains[e.caip2];return n?{caip2:e.caip2,displayName:n.displayName,iconUrl:n.iconUrl,vmType:n.vmType,currencyAddress:e.address,currencyDecimals:e.decimals}:null})).filter((e=>e!==null))}function Y(e,t){if(!e.chains[t.destinationChain])return`Unsupported destination chain: "${t.destinationChain}". Check that the chain is in CAIP-2 format (e.g. "eip155:8453") and is supported for deposit addresses.`;let n=t.destinationCurrency.toLowerCase();return e.currencies.some((e=>e.chains.some((e=>e.caip2===t.destinationChain&&e.address.toLowerCase()===n))))?null:`Unsupported destination currency "${t.destinationCurrency}" on chain "${t.destinationChain}". Check that this token address is supported on the specified chain.`}var xe=new Set([`ROUTE_UNAVAILABLE`,`UNEXPECTED_STATE`,`TIMEOUT_WAITING_FOR_NEXT_ORDER`,`TIMEOUT_ORDER_COMPLETION`,`DEPOSIT_FAILED`,`DEPOSIT_REFUNDED`,`USER_EXITED`,`AMOUNT_TOO_LOW`,`INSUFFICIENT_LIQUIDITY`,`UNSUPPORTED_CHAIN`,`UNSUPPORTED_CURRENCY`,`UNSUPPORTED_ROUTE`,`NO_SWAP_ROUTES_FOUND`,`NO_INTERNAL_SWAP_ROUTES_FOUND`,`NO_QUOTES`,`SANCTIONED_WALLET_ADDRESS`,`REFUND_WALLET_CREATION_FAILED`,`DEPOSIT_ADDRESSES_NOT_ENABLED`,`NOT_AUTHENTICATED`]);function Se(e){return xe.has(e)}function X(e){return Se(e)?e:`UNKNOWN_ERROR`}function Z(){let{params:e,setModalState:t}=z(),{privy:n}=O(),r=function(){let{privy:e,refreshSessionAndUser:t}=O();return(0,U.useCallback)(((n,r)=>r?Promise.resolve({ok:!0,address:r}):k.resolveRefundAddress({privy:e,caip2:n,onWalletCreated:t})),[e,t])}(),[i,a]=(0,U.useState)(!1);return{fetchQuote:(0,U.useCallback)((async(i,o,s)=>{if(e){a(!0);try{let a=await r(i.caip2,e.refundAddress);if(!a.ok)return void t({step:`error`,code:X(a.error)});let c=await n.fetchPrivyRoute(D,{body:{source_chain:i.caip2,source_currency:i.currencyAddress,destination_chain:e.destinationChain,destination_currency:e.destinationCurrency,destination_address:e.destinationAddress,refund_address:a.address,...e.slippageBps==null?{}:{slippage_bps:e.slippageBps}}});t({step:`address`,selectedCurrency:o,selectedChain:i,availableChains:s,quote:c})}catch(e){let n=e instanceof Error?e:Error(String(e)),r=`status`in n&&typeof n.status==`number`?n.status:void 0;t({step:`error`,code:n instanceof ne&&n.code===`feature_not_enabled`?`DEPOSIT_ADDRESSES_NOT_ENABLED`:r&&r>=500?`UNKNOWN_ERROR`:X(n.message),message:n.message})}finally{a(!1)}}}),[e,n,r,t]),isFetching:i}}function Q(e,t){switch(e.status){case`completed`:return t({step:`complete`,order:e});case`refunded`:return t({step:`refunded`,order:e});case`failed`:return t({step:`failed`,order:e});case`executing`:return t({step:`processing`,order:e});default:return}}var Ce=({sourceAmount:e,sourceSymbol:t,sourceChainName:n,sourceDecimals:r,destinationAmount:a,destSymbol:o,destChainName:s,destDecimals:c,onClose:u})=>(0,H.jsx)(l,{icon:i,iconVariant:`success`,title:`Transfer complete`,subtitle:a?`Received ${G(e,r)} ${t} on ${n} and converted it to ${G(a,c)} ${o} on ${s}. Funds are available to use.`:`Your ${t} has been received and is now available in your wallet.`,showClose:!0,onClose:u,primaryCta:{label:`Done`,onClick:u},watermark:!1});function we(){let{state:e,configData:t,close:n}=V(`complete`),{order:r}=e,{sourceSymbol:i,sourceChainName:a,sourceDecimals:o,destSymbol:s,destChainName:c,destDecimals:l}=(0,U.useMemo)((()=>{let e=K({address:r.source_currency,caip2:r.source_chain,config:t}),n=K({address:r.destination_currency,caip2:r.destination_chain,config:t});return{sourceSymbol:e.symbol,sourceChainName:q(r.source_chain,t.chains),sourceDecimals:e.decimals,destSymbol:n.symbol,destChainName:q(r.destination_chain,t.chains),destDecimals:n.decimals}}),[r,t]);return(0,H.jsx)(Ce,{sourceAmount:r.source_amount,sourceSymbol:i,sourceChainName:a,sourceDecimals:o,destinationAmount:r.destination_amount,destSymbol:s,destChainName:c,destDecimals:l,onClose:n})}function Te(){let{modalState:e,setModalState:t,config:n,retryConfig:r,close:i,createDepositAddressEvent:a}=z();if(e.step!==`error`)throw Error(`UNEXPECTED_STATE`);let{code:o}=e,{title:s,subtitle:c,detail:u,iconVariant:d}=(e=>{switch(e){case`AMOUNT_TOO_LOW`:return{title:`Amount too low`,subtitle:`The deposit amount is below the minimum for this route.`,detail:`Try a larger amount or a different token.`,iconVariant:`warning`};case`INSUFFICIENT_LIQUIDITY`:return{title:`Insufficient liquidity`,subtitle:`There isn't enough liquidity for this route right now.`,detail:`Try a smaller amount or a different network.`,iconVariant:`warning`};case`UNSUPPORTED_CHAIN`:return{title:`Unsupported chain`,subtitle:`Deposits from this chain type aren't supported yet. Try a different network.`,iconVariant:`warning`};case`UNSUPPORTED_CURRENCY`:case`UNSUPPORTED_ROUTE`:case`ROUTE_UNAVAILABLE`:case`NO_SWAP_ROUTES_FOUND`:case`NO_INTERNAL_SWAP_ROUTES_FOUND`:case`NO_QUOTES`:return{title:`Route not available`,subtitle:`This deposit route isn't supported right now. Try a different token or network.`,iconVariant:`warning`};case`SANCTIONED_WALLET_ADDRESS`:return{title:`Address restricted`,subtitle:`This address cannot be used for deposits due to compliance restrictions.`,iconVariant:`warning`};case`REFUND_WALLET_CREATION_FAILED`:return{title:`Unable to set up refund address`,subtitle:`We couldn't create a wallet to receive refunds on this chain. Please try again or select a different network.`,iconVariant:`warning`};case`DEPOSIT_ADDRESSES_NOT_ENABLED`:return{title:`Not enabled`,subtitle:`Deposit addresses are not enabled for this app.`,iconVariant:`warning`};case`NOT_AUTHENTICATED`:return{title:`Not signed in`,subtitle:`Please sign in to continue with your deposit.`,iconVariant:`warning`};case`TIMEOUT_WAITING_FOR_NEXT_ORDER`:case`TIMEOUT_ORDER_COMPLETION`:return{title:`Taking longer than expected`,subtitle:`Your funds are safe. The deposit is still being processed — check back later.`,iconVariant:`subtle`};default:return{title:`Something went wrong`,subtitle:`We couldn't complete your request. Please try again.`,iconVariant:`subtle`}}})(o),[f,p]=(0,U.useState)(!1);return(0,H.jsx)(l,{icon:T,iconVariant:d,title:s,subtitle:u?`${c} ${u}`:c,showClose:!0,onClose:i,primaryCta:{label:`Try again`,onClick:async()=>{if(a({eventName:`sdk_deposit_address_action`,payload:{action:`retry`,step:`error`,errorCode:o}}),n.status!==`ready`){p(!0);try{await r(),t({step:`token`})}catch{p(!1)}}else t({step:`token`})},loading:f},watermark:!0})}function Ee(){let{state:e,close:t,createDepositAddressEvent:n}=V(`failed`),{order:r}=e;return(0,H.jsx)(A,{icon:T,iconVariant:`error`,title:`Transfer failed`,subtitle:`Something went wrong processing your transfer.`,showClose:!0,onClose:t,primaryCta:{label:`Done`,onClick:t},secondaryCta:{label:`Learn about manual recovery`,onClick:()=>{n({eventName:`sdk_deposit_address_action`,payload:{action:`link_opened`,step:`failed`,target:`recovery_docs`}}),window.open(`https://docs.privy.io`,`_blank`,`noopener,noreferrer`)}},watermark:!0,children:(0,H.jsxs)(De,{href:r.tracking_url,target:`_blank`,rel:`noopener noreferrer`,onClick:()=>{n({eventName:`sdk_deposit_address_action`,payload:{action:`link_opened`,step:`failed`,target:`relay_reference`}})},children:[`Reference: `,r.provider_request_id]})})}var De=E.a`
  text-align: center;
  font-size: 0.75rem;
  opacity: 0.7;
  text-decoration: underline;
  cursor: pointer;
  color: var(--privy-color-foreground-3);
`;function Oe(){let{close:e,setModalState:t,config:n,params:r,onBack:i,createDepositAddressEvent:a}=z(),[o,s]=(0,U.useState)(!1);return(0,U.useEffect)((()=>{if(o&&r){if(n.status===`ready`){let e=Y(n.data,r);t(e?{step:`error`,code:`ROUTE_UNAVAILABLE`,message:e}:{step:`token`})}n.status===`error`&&t({step:`error`,code:`ROUTE_UNAVAILABLE`})}}),[o,n,r,t]),(0,H.jsx)(l,{icon:w,iconVariant:`subtle`,title:`Add funds`,subtitle:`Top up your account by sending crypto from any wallet. Conversion and routing handled by Relay.`,showClose:!0,onClose:e,showBack:!!i,onBack:i?()=>{a({eventName:`sdk_deposit_address_action`,payload:{action:`back`,step:`intro`}}),i()}:void 0,primaryCta:{label:`Continue`,onClick:()=>{if(a({eventName:`sdk_deposit_address_action`,payload:{action:`continue`,step:`intro`}}),n.status===`ready`&&r){let e=Y(n.data,r);t(e?{step:`error`,code:`ROUTE_UNAVAILABLE`,message:e}:{step:`token`})}else n.status===`error`?t({step:`error`,code:`ROUTE_UNAVAILABLE`}):s(!0)},loading:o&&n.status===`loading`,loadingText:null},watermark:!0})}function ke(){let{state:e,setModalState:t,close:n,createDepositAddressEvent:r}=V(`network`),[i,a]=(0,U.useState)(-1),{availableChains:o}=e,{confirm:c,isFetching:l}=function(){let e=B(),{params:t}=z(),{fetchQuote:n,isFetching:r}=Z();return{confirm:(0,U.useCallback)((async r=>{if(!r||!t)return;let i=e?.modalState;i&&i.step===`network`&&await n(r,i.selectedCurrency,i.availableChains)}),[t,e,n]),isFetching:r}}();return(0,H.jsx)(A,{title:`Select network`,eyebrow:(0,H.jsxs)(`span`,{style:{display:`flex`,alignItems:`center`,gap:`0.375rem`},children:[(0,H.jsx)(`img`,{src:e.selectedCurrency.logoURI,alt:``,style:{width:`1rem`,height:`1rem`,borderRadius:`50%`}}),`Send `,e.selectedCurrency.symbol]}),showBack:!0,onBack:()=>{r({eventName:`sdk_deposit_address_action`,payload:{action:`back`,step:`network`}}),t({step:`token`})},showClose:!0,onClose:n,watermark:!0,children:(0,H.jsx)(j,{style:{marginTop:`1rem`,height:`22rem`},$colorScheme:`light`,children:o.map(((e,t)=>(0,H.jsxs)(m,{$selected:i===t,disabled:l,onClick:()=>{r({eventName:`sdk_deposit_address_action`,payload:{action:`network_selected`,step:`network`,network:e.caip2}}),a(t),c(e)},children:[(0,H.jsx)(g,{src:e.iconUrl,alt:e.displayName}),(0,H.jsx)(h,{children:e.displayName}),l&&t===i&&(0,H.jsx)(s,{})]},e.caip2)))})})}var Ae=({trackingUrl:e,onViewBlockExplorer:t,onClose:n})=>(0,H.jsx)(A,{icon:o,iconVariant:`subtle`,title:`Transfer in progress`,subtitle:`Your deposit was received and the transfer is now processing.`,showClose:!0,onClose:n,secondaryCta:{label:`View on block explorer ↗`,onClick:()=>{t(),window.open(e,`_blank`,`noopener,noreferrer`)}},watermark:!1,children:(0,H.jsxs)(C,{children:[(0,H.jsxs)(v,{children:[(0,H.jsx)(d,{$status:`done`,children:(0,H.jsx)(i,{size:14,color:`var(--privy-color-icon-success)`,strokeWidth:2})}),(0,H.jsx)(c,{children:`Deposit received`})]}),(0,H.jsx)(f,{}),(0,H.jsxs)(v,{children:[(0,H.jsx)(d,{$status:`active`,children:(0,H.jsx)(je,{})}),(0,H.jsx)(c,{children:`Bridging`})]}),(0,H.jsx)(f,{}),(0,H.jsxs)(v,{children:[(0,H.jsx)(d,{$status:`pending`}),(0,H.jsx)(c,{children:`Funds arrived`})]})]})}),je=E.span`
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--privy-color-foreground-3);
  border-bottom-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;function Me(){let{state:e,close:t,createDepositAddressEvent:n}=V(`processing`);return function({orderId:e,enabled:t}){let{privy:n}=O(),{setModalState:r}=z();(0,U.useEffect)((()=>{let t=new AbortController;return k.waitForCompletion({privy:n,orderId:e,signal:t.signal}).then((e=>{t.signal.aborted||(e.status===`success`?Q(e.order,r):e.status===`timeout`&&r({step:`error`,code:`TIMEOUT_ORDER_COMPLETION`}))})),()=>{t.abort()}}),[t,e,n,r])}({orderId:e.order.id,enabled:!0}),(0,H.jsx)(Ae,{trackingUrl:e.order.tracking_url,onViewBlockExplorer:()=>{n({eventName:`sdk_deposit_address_action`,payload:{action:`link_opened`,step:`processing`,target:`block_explorer`}})},onClose:t})}function Ne(){let{state:e,close:t,createDepositAddressEvent:n}=V(`refunded`),{order:r}=e;return(0,H.jsx)(l,{icon:ve,iconVariant:`subtle`,title:`Transfer refunded`,subtitle:`Your transfer was received, but the swap couldn't be completed. A refund has been started automatically.`,showClose:!0,onClose:t,primaryCta:{label:`Done`,onClick:t},secondaryCta:{label:`View transaction details`,onClick:()=>{n({eventName:`sdk_deposit_address_action`,payload:{action:`link_opened`,step:`refunded`,target:`transaction_details`}}),window.open(r.tracking_url,`_blank`,`noopener,noreferrer`)}},watermark:!0})}function Pe(){let{close:e,setModalState:t,config:n,createDepositAddressEvent:r}=z(),{confirm:i,currencies:a,isFetching:o}=function(){let{config:e,setModalState:t}=z(),{fetchQuote:n,isFetching:r}=Z(),i=e.status===`ready`?e.data.currencies.filter((t=>J(t,e.data).length>0)):[];return{confirm:(0,U.useCallback)((async r=>{if(e.status!==`ready`||!r)return;let i=J(r,e.data);if(i.length!==1)t({step:`network`,selectedCurrency:r,availableChains:i});else{let e=i[0];await n(e,r,i)}}),[e,n,t]),currencies:i,isFetching:r}}(),[c,l]=(0,U.useState)(-1);return(0,H.jsx)(A,{title:`Select token`,showBack:!0,onBack:()=>{r({eventName:`sdk_deposit_address_action`,payload:{action:`back`,step:`token`}}),t({step:`intro`})},showClose:!0,onClose:e,watermark:!0,children:n.status===`error`?(0,H.jsx)(b,{children:(0,H.jsx)(u,{children:`Failed to load tokens`})}):n.status===`loading`?(0,H.jsx)(b,{children:(0,H.jsx)(re,{})}):(0,H.jsx)(j,{style:{marginTop:`1rem`,height:`22rem`},$colorScheme:`light`,children:a.map(((e,t)=>(0,H.jsxs)(m,{$selected:c===t,disabled:o,onClick:()=>{r({eventName:`sdk_deposit_address_action`,payload:{action:`token_selected`,step:`token`,token:e.symbol}}),l(t),i(e)},children:[(0,H.jsx)(S,{src:e.logoURI,alt:e.symbol}),(0,H.jsx)(h,{children:e.name}),o&&t===c?(0,H.jsx)(s,{}):(0,H.jsx)(y,{children:e.symbol})]},e.symbol)))})})}function Fe({address:e,onClick:t}){let[n,r]=(0,U.useState)(!1);return(0,H.jsx)(H.Fragment,{children:n?(0,H.jsx)(Ie,{onClick:()=>r(!1),style:{marginTop:`1.5rem`},children:(0,H.jsx)(he,{url:e,size:312,hideLogo:!0})}):(0,H.jsxs)(Le,{title:`Click to copy address`,onClick:t,style:{marginTop:`1.5rem`},children:[(0,H.jsxs)(Re,{children:[(0,H.jsx)(ze,{children:`Deposit address`}),(0,H.jsx)(Be,{children:e})]}),(0,H.jsx)(Ve,{children:(0,H.jsx)(He,{type:`button`,onClick:e=>{e.stopPropagation(),r(!0)},children:(0,H.jsx)(w,{size:16,color:`var(--privy-color-icon-muted)`})})})]})})}var Ie=E.div`
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  overflow: hidden;
`,Le=E.div`
  display: flex;
  border-radius: var(--privy-border-radius-md);
  background: var(--privy-color-background-clicked, #f1f2f9);
  padding: 1rem;
  cursor: pointer;
  gap: 0.5rem;
`,Re=E.div`
  flex: 1;
  min-width: 0;
  text-align: left;
`,ze=E.div`
  font-size: 0.75rem;
  color: var(--privy-color-icon-muted);
  line-height: 1rem;
  margin-bottom: 0.25rem;
`,Be=E.div`
  word-break: break-all;
  font-size: 0.875rem;
  font-family: ui-monospace, monospace;
  font-weight: 500;
  line-height: 1.375rem;
  color: var(--privy-color-foreground);
`,Ve=E.div`
  width: 1.5rem;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding-top: 0.25rem;
`,He=E.button`
  && {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    outline: none;
    box-shadow: none;
    border-radius: var(--privy-border-radius-xs);

    &:hover {
      background: var(--privy-color-background);
    }

    &:focus,
    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }
`;function Ue({quote:e,selectedCurrency:t,selectedChain:n,destinationSymbol:r}){let[i,o]=(0,U.useState)(!1),s=t.symbol.toUpperCase(),c=n.displayName,l=(0,U.useRef)(null);return(0,H.jsxs)(We,{children:[(0,H.jsxs)(Ge,{onClick:(0,U.useCallback)((()=>{let e=document.getElementById(`privy-modal-content`);e&&(l.current&&clearTimeout(l.current),e.style.transition=`none`,l.current=setTimeout((()=>{e.style.transition=``,l.current=null}),160)),o((e=>!e))}),[]),children:[(0,H.jsxs)(Ke,{children:[t.logoURI&&(0,H.jsx)(S,{src:t.logoURI,alt:s,style:{width:`2rem`,height:`2rem`}}),n.iconUrl&&(0,H.jsx)(qe,{src:n.iconUrl,alt:c})]}),(0,H.jsxs)(Je,{children:[(0,H.jsx)($,{children:`You send`}),(0,H.jsxs)(Ye,{children:[s,` on `,c]})]}),(0,H.jsx)(Xe,{children:(0,H.jsx)(i?ge:a,{size:16})})]}),(0,H.jsx)(et,{$expanded:i,children:(0,H.jsx)(tt,{children:(0,H.jsxs)(Ze,{children:[e.indicative_rate&&(0,H.jsxs)(p,{children:[(0,H.jsx)(x,{children:`Conversion rate`}),(0,H.jsxs)(_,{style:{display:`flex`,alignItems:`center`,gap:`0.25rem`},children:[be(e.indicative_rate,s,r.toUpperCase()),(0,H.jsx)(nt,{content:`Estimated rate based on current market conditions. Final execution price may vary depending on transfer size and routing.`})]})]}),(0,H.jsxs)(p,{children:[(0,H.jsx)(x,{children:`Max slippage`}),(0,H.jsxs)(_,{children:[(e.slippage_bps/100).toFixed(1),`%`]})]}),(0,H.jsxs)(p,{children:[(0,H.jsx)(x,{children:`Refund address`}),(0,H.jsx)(_,{children:(0,H.jsx)(pe,{value:e.refund_address,iconOnly:!0,iconSize:11,children:te(e.refund_address,4,4)})})]})]})})}),(0,H.jsxs)(Qe,{children:[(0,H.jsx)(T,{size:16,color:`var(--privy-color-icon-muted)`,style:{flexShrink:0}}),(0,H.jsxs)($e,{children:[`Only send `,(0,H.jsx)(`strong`,{children:s}),` on `,(0,H.jsx)(`strong`,{children:c}),`. Other assets may be lost.`]})]})]})}var We=E.div`
  border-radius: var(--privy-border-radius-md);
  border: 1px solid var(--privy-color-foreground-4);
  overflow: hidden;
`,Ge=E.button`
  && {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--privy-color-foreground);
    outline: none;
    box-shadow: none;

    &:focus,
    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }
`,Ke=E.span`
  position: relative;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
`,qe=E(g)`
  && {
    position: absolute;
    top: -0.125rem;
    right: -0.25rem;
    width: 0.75rem;
    height: 0.75rem;
    box-sizing: content-box;
    border: 1.5px solid #fff;
    background-color: #fff;
  }
`,Je=E.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`,$=E.span`
  font-size: 0.75rem;
  color: var(--privy-color-foreground-3);
  line-height: 1rem;
`,Ye=E.span`
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25rem;
`,Xe=E.span`
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-clicked, #f1f2f9);
  color: var(--privy-color-foreground-3);
`,Ze=E.div`
  display: flex;
  flex-direction: column;
  padding: 0 1rem 0.75rem;

  & > * {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--privy-color-foreground-4);
  }

  & > *:last-child {
    border-bottom: none;
  }
`,Qe=E.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0.75rem 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--privy-border-radius-sm);
  background: #f8f9fc;
`,$e=E.span`
  font-size: 0.8125rem;
  line-height: 1.25rem;
  color: var(--privy-color-icon-muted);
  text-align: left;
`,et=E.div`
  display: grid;
  grid-template-rows: ${({$expanded:e})=>e?`1fr`:`0fr`};
  transition: grid-template-rows 150ms ease-out;
`,tt=E.div`
  overflow: hidden;
`;function nt({content:e}){let[t,n]=(0,U.useState)(!1),{refs:r,floatingStyles:i,context:a}=P({open:t,onOpenChange:n,placement:`top`,whileElementsMounted:ce,middleware:[se(6),le(),oe({padding:8})]}),o=de(a,{move:!1,handleClose:F()}),s=I(a),{getReferenceProps:c,getFloatingProps:l}=R([o,s,N(a),ue(a),fe(a,{role:`tooltip`})]),{isMounted:u,styles:d}=M(a,{duration:150});return(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)(`button`,{ref:r.setReference,type:`button`,"aria-label":`More information about conversion rate`,style:{display:`inline-flex`,alignItems:`center`,justifyContent:`center`,padding:0,border:`none`,background:`none`,color:`var(--privy-color-icon-muted)`,cursor:`pointer`},...c(),children:(0,H.jsx)(_e,{size:14})}),u&&(0,H.jsx)(L,{root:document.getElementById(`privy-modal-content`)??void 0,children:(0,H.jsx)(rt,{ref:r.setFloating,style:{...i,...d},...l(),children:e})})]})}var rt=E.div`
  max-width: 13rem;
  padding: 0.5rem 0.625rem;
  border-radius: var(--privy-border-radius-sm, 0.375rem);
  background: var(--privy-color-foreground);
  color: var(--privy-color-background);
  font-size: 0.6875rem;
  line-height: 1rem;
  font-weight: 400;
  text-align: left;
  z-index: 10;
`,it=({quote:e,selectedCurrency:t,selectedChain:n,destinationSymbol:r,onBack:a,onClose:o})=>{let[s,c]=(0,U.useState)(!1),l=t?.symbol?.toUpperCase()??`funds`,u=n?.displayName??``,d=async()=>{s||(await navigator.clipboard.writeText(e.deposit_address),c(!0),setTimeout((()=>c(!1)),2e3))};return(0,H.jsxs)(A,{title:`Send ${l}${u?` on ${u}`:``}`,subtitle:`Send funds to the address below. Conversion and routing handled by Relay.`,showBack:!0,onBack:a,showClose:!0,onClose:o,watermark:!1,children:[(0,H.jsx)(Ue,{quote:e,selectedCurrency:t,selectedChain:n,destinationSymbol:r}),(0,H.jsx)(Fe,{address:e.deposit_address,onClick:d}),(0,H.jsx)(ae,{style:{marginTop:`1rem`,marginBottom:`0.5rem`,...s?{backgroundColor:`var(--privy-color-icon-success)`,borderColor:`var(--privy-color-icon-success)`}:{}},onClick:d,children:s?(0,H.jsxs)(H.Fragment,{children:[`Copied `,(0,H.jsx)(i,{size:16,style:{marginLeft:`0.25rem`}})]}):`Copy address`}),(0,H.jsx)(at,{children:`Routing and bridging are handled by Relay. Privy does not control execution timing, liquidity, or transaction outcomes.`})]})},at=E.p`
  && {
    margin: 0.5rem 0 0;
    font-size: 0.6875rem;
    line-height: 1.125rem;
    color: var(--privy-color-icon-muted);
    text-align: center;
  }
`;function ot(){let{state:e,configData:t,setModalState:n,close:r,params:i,createDepositAddressEvent:a}=V(`address`),{quote:o,selectedCurrency:s,selectedChain:c,availableChains:l}=e;return function({depositAddressId:e,enabled:t,quoteCreatedAt:n}){let{privy:r}=O(),{setModalState:i}=z();(0,U.useEffect)((()=>{if(!e)return;let t=new AbortController;return k.waitForDeposit({privy:r,depositAddressId:e,quoteCreatedAt:n,signal:t.signal}).then((e=>{t.signal.aborted||(e.status===`success`?Q(e.order,i):e.status===`timeout`&&i({step:`error`,code:`TIMEOUT_WAITING_FOR_NEXT_ORDER`}))})),()=>{t.abort()}}),[t,e,r,n,i])}({depositAddressId:o.id,enabled:!0,quoteCreatedAt:o.created_at}),(0,H.jsx)(it,{quote:o,selectedCurrency:s,selectedChain:c,destinationSymbol:(0,U.useMemo)((()=>K({address:i.destinationCurrency,caip2:i.destinationChain,config:t}).symbol),[i,t]),onBack:()=>{a({eventName:`sdk_deposit_address_action`,payload:{action:`back`,step:`address`}}),n({step:`network`,selectedCurrency:s,availableChains:l})},onClose:r})}function st(){let{modalState:e,setModalState:t}=z();return(0,H.jsx)(ye,{onError:e=>t({step:`error`,code:`UNEXPECTED_STATE`,message:e.message}),resetKey:e.step,children:(0,H.jsx)(ct,{})})}function ct(){let{modalState:e}=z();switch(e.step){case`intro`:return(0,H.jsx)(Oe,{});case`token`:return(0,H.jsx)(Pe,{});case`network`:return(0,H.jsx)(ke,{});case`address`:return(0,H.jsx)(ot,{});case`processing`:return(0,H.jsx)(Me,{});case`complete`:return(0,H.jsx)(we,{});case`refunded`:return(0,H.jsx)(Ne,{});case`failed`:return(0,H.jsx)(Ee,{});case`error`:return(0,H.jsx)(Te,{});default:return null}}var lt={component:()=>{let{onUserCloseViaDialogOrKeybindRef:e}=ie(),t=B(),{close:n,config:r}=z();return(0,U.useEffect)((()=>{e.current=n}),[e,n]),(0,U.useEffect)((()=>{if(r.status===`ready`){for(let e of r.data.currencies)new Image().src=e.logoURI;for(let e of Object.values(r.data.chains))new Image().src=e.iconUrl}}),[r]),t?(0,H.jsx)(st,{}):null}};export{lt as default};