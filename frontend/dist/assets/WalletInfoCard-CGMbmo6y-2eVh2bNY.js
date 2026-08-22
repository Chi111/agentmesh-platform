import{o as e}from"./rolldown-runtime-C_s2cVnS.js";import{t}from"./react-DTjR_b-G.js";import{t as n}from"./jsx-runtime-Bbae7Wnw.js";import{t as r}from"./check-vK2tiAYS.js";import{t as i}from"./copy-D_eRKX9K.js";import{Lt as a}from"./useActiveWallet-Ch3qUtGV-CZHSbNGN.js";import{t as o}from"./ModalHeader-prCgwil--BQte5Nr4.js";import{t as s}from"./ErrorMessage-D8VaAP5m-BpYGvCGQ.js";import{t as c}from"./shared-FM0rljBt-n4-9xTsN.js";import{t as l}from"./Address-BsV5TcKi-CUpObp1J.js";import{t as u}from"./LabelXs-oqZNqbm_-DxHDalEl.js";var d=n(),f=e(t(),1),p=a(c)`
  && {
    padding: 0.75rem;
    height: 56px;
  }
`,m=a.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`,h=a.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`,g=a.div`
  font-size: 12px;
  line-height: 1rem;
  color: var(--privy-color-foreground-3);
`,_=a(u)`
  text-align: left;
  margin-bottom: 0.5rem;
`,v=a(s)`
  margin-top: 0.25rem;
`,y=a(o)`
  && {
    gap: 0.375rem;
    font-size: 14px;
  }
`,b=({errMsg:e,balance:t,address:n,className:a,title:o,showCopyButton:s=!1})=>{let[c,u]=(0,f.useState)(!1);return(0,f.useEffect)((()=>{if(c){let e=setTimeout((()=>u(!1)),3e3);return()=>clearTimeout(e)}}),[c]),(0,d.jsxs)(`div`,{children:[o&&(0,d.jsx)(_,{children:o}),(0,d.jsx)(p,{className:a,$state:e?`error`:void 0,children:(0,d.jsxs)(m,{children:[(0,d.jsxs)(h,{children:[(0,d.jsx)(l,{address:n,showCopyIcon:!1}),t!==void 0&&(0,d.jsx)(g,{children:t})]}),s&&(0,d.jsx)(y,{onClick:function(e){e.stopPropagation(),navigator.clipboard.writeText(n).then((()=>u(!0))).catch(console.error)},size:`sm`,children:(0,d.jsxs)(d.Fragment,c?{children:[`Copied`,(0,d.jsx)(r,{size:14})]}:{children:[`Copy`,(0,d.jsx)(i,{size:14})]})})]})}),e&&(0,d.jsx)(v,{children:e})]})};export{b as t};