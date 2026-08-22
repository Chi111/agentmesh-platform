import{n as e}from"./LinkPasskeyScreen-CYW-jKj_-C8coL9t6.js";import{Ft as t,Rt as n}from"./useActiveWallet-Ch3qUtGV-KS612z6P.js";import{n as r}from"./ModalHeader-prCgwil--kFrDqgZG.js";var i=n.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 24px;
  padding-bottom: 24px;
`,a=n.div`
  width: 24px;
  height: 24px;
  display: flex;
  justify-content: center;
  align-items: center;

  svg {
    border-radius: var(--privy-border-radius-sm);
  }
`,o=n.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 8px;
`,s=n.div`
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 0 16px;
  border-width: 1px !important;
  border-radius: 12px;
  cursor: text;

  &:focus-within {
    border-color: var(--privy-color-accent);
  }
`;n.div`
  font-size: 42px !important;
`;var c=n.input`
  background-color: var(--privy-color-background);
  width: 100%;

  &:focus {
    outline: none !important;
    border: none !important;
    box-shadow: none !important;
  }

  && {
    font-size: 26px;
  }
`,l=n(c)`
  && {
    font-size: 42px;
  }
`;n.button`
  cursor: pointer;
  padding-left: 4px;
`;var u=n.div`
  font-size: 18px;
`,d=n.div`
  font-size: 12px;
  color: var(--privy-color-foreground-3);
  // we need this container to maintain a static height if there's no content
  height: 20px;
`;n.div`
  display: flex;
  flex-direction: row;
  line-height: 22px;
  font-size: 16px;
  text-align: center;
  svg {
    margin-right: 6px;
    margin: auto;
  }
`,n(e)`
  margin-top: 16px;
`;var f=t`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;n(r)`
  border-radius: var(--privy-border-radius-md) !important;
  animation: ${f} 0.3s ease-in-out;
`;var p=n.div``,m=n.a`
  && {
    color: var(--privy-color-accent);
  }

  cursor: pointer;
`;export{m as a,a as c,i,s as l,u as n,d as o,l as r,p as s,o as t,c as u};