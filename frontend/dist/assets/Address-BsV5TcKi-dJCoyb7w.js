import{o as e}from"./rolldown-runtime-C_s2cVnS.js";import{t}from"./react-DTjR_b-G.js";import{t as n}from"./jsx-runtime-Bbae7Wnw.js";import{t as r}from"./check-vK2tiAYS.js";import{t as i}from"./copy-D_eRKX9K.js";import{H as a,Rt as o}from"./useActiveWallet-Ch3qUtGV-KS612z6P.js";import{t as s}from"./ModalHeader-prCgwil--kFrDqgZG.js";var c=n(),l=e(t(),1),u=({address:e,showCopyIcon:t,url:n,className:o})=>{let[u,m]=(0,l.useState)(!1);function h(t){t.stopPropagation(),navigator.clipboard.writeText(e).then((()=>m(!0))).catch(console.error)}return(0,l.useEffect)((()=>{if(u){let e=setTimeout((()=>m(!1)),3e3);return()=>clearTimeout(e)}}),[u]),(0,c.jsxs)(d,n?{children:[(0,c.jsx)(p,{title:e,className:o,href:`${n}/address/${e}`,target:`_blank`,children:a(e)}),t&&(0,c.jsx)(s,{onClick:h,size:`sm`,style:{gap:`0.375rem`},children:(0,c.jsxs)(c.Fragment,u?{children:[`Copied`,(0,c.jsx)(r,{size:16})]}:{children:[`Copy`,(0,c.jsx)(i,{size:16})]})})]}:{children:[(0,c.jsx)(f,{title:e,className:o,children:a(e)}),t&&(0,c.jsx)(s,{onClick:h,size:`sm`,style:{gap:`0.375rem`,fontSize:`14px`},children:(0,c.jsxs)(c.Fragment,u?{children:[`Copied`,(0,c.jsx)(r,{size:14})]}:{children:[`Copy`,(0,c.jsx)(i,{size:14})]})})]})},d=o.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`,f=o.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,p=o.a`
  font-size: 14px;
  color: var(--privy-color-foreground);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;export{u as t};