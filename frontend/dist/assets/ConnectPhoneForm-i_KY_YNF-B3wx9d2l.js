import{o as e}from"./rolldown-runtime-C_s2cVnS.js";import{t}from"./react-DTjR_b-G.js";import{t as n}from"./jsx-runtime-Bbae7Wnw.js";import{Rt as r,Wt as i,bn as a,c as o,cn as s,hn as c,in as l,rn as u,yn as d}from"./useActiveWallet-Ch3qUtGV-KS612z6P.js";import{k as f}from"./context-BPa0mZTP-D_JIjJZI.js";import{i as p,l as m}from"./ModalHeader-prCgwil--kFrDqgZG.js";import{t as h}from"./Chip-CgNhjHa3-j2-z7RlD.js";var g=n(),_=e(t(),1),v=({value:e,onChange:t})=>(0,g.jsx)(`select`,{value:e,onChange:t,children:s.map((e=>(0,g.jsxs)(`option`,{value:e.code,children:[e.code,` +`,e.callCode]},e.code)))}),y=(0,_.forwardRef)(((e,t)=>{let n=f(),[r,s]=(0,_.useState)(!1),{accountType:y}=o(),[S,C]=(0,_.useState)(``),[w,T]=(0,_.useState)(e.defaultCountry??n?.intl.defaultCountry??`US`),E=u(S,w),D=i(w),O=d(w),k=a(w),A=!E,[j,M]=(0,_.useState)(!1),N=k.length,P=t=>{let n=t.target.value;T(n),C(``),e.onChange&&e.onChange({rawPhoneNumber:S,qualifiedPhoneNumber:l(S,n),countryCode:n,isValid:u(S,w)})},F=(t,n)=>{try{let r=t.replace(/\D/g,``)===S.replace(/\D/g,``)?t:D.input(t);C(r),e.onChange&&e.onChange({rawPhoneNumber:r,qualifiedPhoneNumber:l(t,n),countryCode:n,isValid:u(t,n)})}catch(e){console.error(`Error processing phone number:`,e)}},I=()=>{M(!0);let t=l(S,w);e.onSubmit({rawPhoneNumber:S,qualifiedPhoneNumber:t,countryCode:w,isValid:u(S,w)}).finally((()=>M(!1)))};return(0,_.useEffect)((()=>{if(e.defaultValue){let t=c(e.defaultValue);D.reset(),P({target:{value:t.countryCode}}),F(t.phone,t.countryCode)}}),[e.defaultValue]),(0,g.jsxs)(g.Fragment,{children:[(0,g.jsx)(b,{children:(0,g.jsxs)(x,{$callingCodeLength:N,$stacked:e.stacked,children:[(0,g.jsx)(v,{value:w,onChange:P}),(0,g.jsx)(`input`,{ref:t,id:`phone-number-input`,className:`login-method-button`,type:`tel`,placeholder:O,onFocus:()=>s(!0),onChange:e=>{F(e.target.value,w)},onKeyUp:e=>{e.key===`Enter`&&I()},value:S,autoComplete:`tel`}),y!==`phone`||r||e.hideRecent?e.stacked||e.noIncludeSubmitButton?(0,g.jsx)(`span`,{}):(0,g.jsx)(p,{isSubmitting:j,onClick:I,disabled:A,children:`Submit`}):(0,g.jsx)(h,{color:`gray`,children:`Recent`})]})}),e.stacked&&!e.noIncludeSubmitButton?(0,g.jsx)(m,{loading:j,loadingText:null,onClick:I,disabled:A,children:`Submit`}):null]})})),b=r.div`
  width: 100%;
`,x=r.label`
  --country-code-dropdown-width: calc(54px + calc(12 * ${e=>e.$callingCodeLength}px));
  --phone-input-extra-padding-left: calc(12px + calc(3 * ${e=>e.$callingCodeLength}px));
  display: block;
  position: relative;
  width: 100%;

  /* Tablet and Up */
  @media (min-width: 441px) {
    --country-code-dropdown-width: calc(52px + calc(10 * ${e=>e.$callingCodeLength}px));
  }

  && > select {
    font-size: 16px;
    height: 24px;
    position: absolute;
    margin: 13px calc(var(--country-code-dropdown-width) / 4);
    line-height: 24px;
    width: var(--country-code-dropdown-width);
    background-color: var(--privy-color-background);
    background-size: auto;
    background-position-x: right;
    cursor: pointer;

    /* Tablet and Up */
    @media (min-width: 441px) {
      font-size: 14px;
      width: var(--country-code-dropdown-width);
    }

    :focus {
      outline: none;
      box-shadow: none;
    }
  }

  && > input {
    font-size: 16px;
    line-height: 24px;
    color: var(--privy-color-foreground);

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    width: calc(100% - var(--country-code-dropdown-width));

    padding: 12px 88px 12px
      calc(var(--country-code-dropdown-width) + var(--phone-input-extra-padding-left));
    padding-right: ${e=>e.$stacked?`16px`:`88px`};
    flex-grow: 1;
    background: var(--privy-color-background);
    border: 1px solid var(--privy-color-foreground-4);
    border-radius: var(--privy-border-radius-md);
    width: 100%;

    :focus {
      outline: none;
      border-color: var(--privy-color-accent);
    }

    :autofill,
    :-webkit-autofill {
      background: var(--privy-color-background);
    }

    /* Tablet and Up */
    @media (min-width: 441px) {
      font-size: 14px;
      padding-right: 78px;
    }
  }

  && > :last-child {
    right: 16px;
    position: absolute;
    top: 50%;
    transform: translate(0, -50%);
  }

  && > button:last-child {
    right: 0px;
    line-height: 24px;
    padding: 13px 17px;

    :focus {
      outline: none;
      border-color: var(--privy-color-accent);
    }
  }

  && > input::placeholder {
    color: var(--privy-color-foreground-3);
  }
`;export{y as t};