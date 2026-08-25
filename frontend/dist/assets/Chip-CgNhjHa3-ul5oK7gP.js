import{t as e}from"./jsx-runtime-Bbae7Wnw.js";import{i as t,r as n,t as r}from"./vendor~AddFundsSelectionScreen-BLwY_zxt~AffirmativeConsentScreen-DuLoZxMh~AwaitingEvmToSolB~gr1jc4zt-D_vmucms.js";import{t as i}from"./LoadingSkeleton-CeUcJdAQ-CPt9bIaT.js";var a=e(),o=({children:e,color:t,isLoading:n,isPulsing:r,...i})=>(0,a.jsx)(s,{$color:t,$isLoading:n,$isPulsing:r,...i,children:e}),s=t.span`
  padding: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1rem; /* 150% */
  border-radius: var(--privy-border-radius-xs);
  display: flex;
  align-items: center;
  ${e=>{let t,i;e.$color===`green`&&(t=`var(--privy-color-success-dark)`,i=`var(--privy-color-success-light)`),e.$color===`red`&&(t=`var(--privy-color-error)`,i=`var(--privy-color-error-light)`),e.$color===`gray`&&(t=`var(--privy-color-foreground-2)`,i=`var(--privy-color-background-2)`);let a=r`
      from, to {
        background-color: ${i};
      }

      50% {
        background-color: rgba(${i}, 0.8);
      }
    `;return n`
      color: ${t};
      background-color: ${i};
      ${e.$isPulsing&&n`
        animation: ${a} 3s linear infinite;
      `};
    `}}

  ${i}
`;export{o as t};