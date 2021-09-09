import React, { useEffect, useState } from "react";
import classes from "./Wallet.module.scss";
import StaButton from "../StaButton/StaButton";
import {
  useWeb3React,
  Web3ReactProvider,
  getWeb3ReactContext,
} from "@web3-react/core";
import { injected, walletConnect } from "../../web3/connectors";
import Big from "big.js";
import { POOLS, ASSETS } from "../../Constants/Constants";
import _ from "lodash";
import { Web3Provider } from "@ethersproject/providers";
import { InjectedConnector } from "@web3-react/injected-connector";
import { BigNumber } from "ethers";
import { Zero } from "@ethersproject/constants";
import { formatEther, formatUnits } from "@ethersproject/units";
import useEthSWR, { EthSWRConfig } from "ether-swr";
import ERC20ABI from "../../Constants/ERC20.abi.json";
import WSTA from "../../Constants/WSTA.json";
import useEtherSWR from "ether-swr/esm";
import { genFormattedNumber } from "../../util/numberFormat";
import WalletStatus from "../WalletStatus/WalletStatus";
import cx from "classnames";
import { useCookies } from "react-cookie";

// import BN from "bn.js";

import Web3 from "web3";

// console.log(useWeb3React<Web3Provider>());

const web3 = new Web3((window as any).ethereum);
const staContract = new web3.eth.Contract(
  ERC20ABI as any,
  "0xa7DE087329BFcda5639247F96140f9DAbe3DeED1"
);
const WstaContract = new web3.eth.Contract(
  WSTA.abi as any,
  "0xeDEec5691f23E4914cF0183A4196bBEb30d027a0"
);

export const Networks = {
  MainNet: 1,
  Goerli: 5,
  Polygon: 137,
  Mumbai: 80001,
};

export interface IERC20 {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
}

export const TOKENS_BY_NETWORK: {
  [key: number]: IERC20[];
} = {
  [Networks.MainNet]: ASSETS.filter((item: any) => item.ticker !== "ETH").map(
    (item: any) => ({
      name: item.name,
      symbol: item.ticker,
      address: item.contractAddress,
      decimals: 18,
    })
  ),
};

export const ABIs = (chainId: number) => {
  const matrix = TOKENS_BY_NETWORK[chainId];
  return Object.entries(
    matrix.reduce((memo, item) => {
      return { ...memo, [item.address]: ERC20ABI };
    }, {})
  );
};

export const injectedConnector = new InjectedConnector({
  supportedChainIds: [
    Networks.MainNet, // Mainet
  ],
});

export const TokenList = ({
  chainId,
  assets,
}: {
  chainId: number;
  assets: any;
  isLiquidity: any;
}) => {
  const { account } = useWeb3React<Web3Provider>();
  const tokens = TOKENS_BY_NETWORK[chainId];

  const { data: balances } = useEtherSWR<BigNumber[]>(
    tokens.map((t) => [t.address, "balanceOf", account!])
  );

  let tokensIncludingBalances;
  if (balances) {
    tokensIncludingBalances = TOKENS_BY_NETWORK[chainId].map(
      (token, index) => ({
        ...token,
        balance: balances[index],
      })
    );
  }

  if (tokensIncludingBalances) {
    return (
      <table>
        {tokensIncludingBalances
          .filter((token) =>
            _.some(assets, (asset) => asset.contractAddress === token.address)
          )
          .map((token) => (
            <TokenBalance key={token.address} {...token} />
          ))}
      </table>
    );
  } else {
    return <table>...</table>;
  }
};

export const EthBalance = () => {
  const { account } = useWeb3React<Web3Provider>();
  const { data: balance, mutate } = useEthSWR(
    ["getBalance", account, "latest"],
    {
      subscribe: [
        {
          name: "block",
          on: (event: any) => {
            // on every block we check if Ether balance has changed by re-fetching
            mutate(undefined, true);
          },
        },
      ],
    }
  );

  if (!balance) {
    return <td>...</td>;
  }

  return (
    <tr>
      <td>Ξ</td>
      <td className={classes.balance}>
        {genFormattedNumber(Big(formatEther(balance)).toNumber(), 2)}
      </td>
    </tr>
  );
};

export const TokenBalance = ({
  symbol,
  address,
  decimals,
}: {
  symbol: string;
  address: string;
  decimals: number;
}) => {
  const { account } = useWeb3React<Web3Provider>();

  const { data: balance, mutate } = useEthSWR([address, "balanceOf", account], {
    subscribe: [
      // A filter from anyone to me
      {
        name: "Transfer",
        topics: [null, account],
        on: (
          state: BigNumber,
          fromAddress: string,
          toAddress: string,
          amount: BigNumber,
          event: any
        ) => {
          const update = state.add(amount);
          mutate(update, false); // optimistic update skip re-fetch
        },
      },
      // A filter from me to anyone
      {
        name: "Transfer",
        topics: [account, null],
        on: (
          state: BigNumber,
          fromAddress: string,
          toAddress: string,
          amount: BigNumber,
          event: any
        ) => {
          const update = state.sub(amount);
          mutate(update, false); // optimistic update skip re-fetch
        },
      },
    ],
  });

  if (!balance) {
    return <td>...</td>;
  }

  return (
    <tr>
      <td>{symbol}</td>
      <td className={classes.balance}>
        {genFormattedNumber(Big(formatUnits(balance, decimals)).toNumber(), 2)}
      </td>
    </tr>
  );
};

const Wallet = (props: any) => {
  const { isStaPage, poolContractAddress } = props;
  const [cookies, setCookie] = useCookies(["statera_dashboard_wallet_closed"]);
  const defaultWalletClosed =
    cookies.statera_dashboard_wallet_closed === "1" ? true : false;
  const [walletClosed, setWalletClosed] = useState(defaultWalletClosed);
  const [ownerAdd, setOwnerAdd] = useState("");
  const [allowence, setAllowence] = useState(0);
  const [balance, setBalance] = useState(0);
  

  const { chainId, account, library, activate, deactivate, active } =
    useWeb3React<Web3Provider>();

  // const onClick = () => {
  //   activate(injectedConnector);
  // };
  //Helper Functions
  type Unit = "ether";

  const toWei = (amount: string) => {
    return web3.utils.toWei(amount, "ether");
  };

  const fromWei = (amount: string) => {
    return web3.utils.fromWei(amount, "ether");
  };

      const WStaAdd = "0xeDEec5691f23E4914cF0183A4196bBEb30d027a0";

      

  const init = async() => {


    const accounts = await web3.eth.getAccounts();
    const defaultAccount = accounts[0]
    setOwnerAdd(defaultAccount);

    if (ownerAdd) {
      const userAllownence = await staContract.methods
        .allowance(ownerAdd, WStaAdd)
        .call()
        .then((res: any) => console.log("ressss", res));
      setAllowence(userAllownence);

      const usersBalance = await staContract.methods
        .balanceOf("0xe476bf01f9643C2F4733C1d5569b165e2301F2CE")
        .call()
        .then((res: any) => setBalance(res));

    }

  }
  init();

  const activateMetamask = async (account: string) => {
    try {
      await activate(injected, (err) => err, true);
      const WStaAdd = "0xeDEec5691f23E4914cF0183A4196bBEb30d027a0";

      type Unit = "ether";
      //Helper Functions
      const toWei = (amount: string) => {
        return web3.utils.toWei(amount, "ether");
      };

      const fromWei = (amount: string) => {
        return web3.utils.fromWei(amount, "ether");
      };
      // console.log(toWei("2"))

      /////Sta Funcitons

      // Allowence

      
    const accounts = await web3.eth.getAccounts();
    const defaultAccount = accounts[0];
    setOwnerAdd(defaultAccount);
     const userAllownence = await staContract.methods

        .allowance(ownerAdd, WStaAdd)
        .call()
        .then((res: any) => console.log("resmm", res));
        setAllowence(userAllownence);

      // BalanceOF Sta
      // await staContract.methods
      //   .balanceOf("0xe476bf01f9643C2F4733C1d5569b165e2301F2CE")
      //   .call()
      //   .then((res: any) => console.log("balance", res));

      ////Wsta Funcitons

      //Wrap

      // await WstaContract.methods
      //   .wrap(toWei("1")) // userInput
      //   .send({ from: "0xe476bf01f9643C2F4733C1d5569b165e2301F2CE" })
      //   .then((res: any) => console.log("res", res));

      //Unwrap

      // await WstaContract.methods
      //   .unwrap(toWei("1")) // userInput
      //   .send({ from: "0xe476bf01f9643C2F4733C1d5569b165e2301F2CE" })
      //   .then((res: any) => console.log("res", res));

      // // BalanceOF Wsta
      // await WstaContract.methods
      //   .balanceOf("0xe476bf01f9643C2F4733C1d5569b165e2301F2CE")
      //   .call()
      //   .then((res: any) => console.log("balance", res));
    } catch (error) {
      console.log(error);
    }
  };

  const Wrap = async () => {
    // await WstaContract.methods
    //   .wrap(toWei("1")) // userInput
    //   .send({ from: "0xe476bf01f9643C2F4733C1d5569b165e2301F2CE" })
    //   .then((res: any) => console.log("res", res));

    console.log(await web3.eth.getAccounts());
  };
  const UnWrap = async () => {
    await WstaContract.methods
      .unwrap(toWei("1")) // userInput
      .send({ from: "0xe476bf01f9643C2F4733C1d5569b165e2301F2CE" })
      .then((res: any) => console.log("res", res));
  };
  const approve = async () => {
    await WstaContract.methods
      .approve(WStaAdd, toWei(balance.toString())) // userInput
      .send({ from: "0xe476bf01f9643C2F4733C1d5569b165e2301F2CE" })
      .then((res: any) => console.log("res", res));
  };
  useEffect(() => {
    props.onWalletChange(defaultWalletClosed);
  }, []);

  const handleWalletChange = (status: boolean) => {
    setWalletClosed(status);
    setCookie("statera_dashboard_wallet_closed", status ? "1" : "0", {
      path: "/",
    });
    console.log("cookies: ", status, cookies.statera_dashboard_wallet_closed);
    props.onWalletChange(status);
  };

  let poolAssets: any = [];
  let currentPool: any;
  if (isStaPage) {
    poolAssets.push(ASSETS.find((item) => item.ticker === "STA"));
    poolAssets.push(ASSETS.find((item) => item.ticker === "wSTA"));
  } else {
    let currentPool: any;
    _.mapValues(POOLS, (value, key) => {
      if (value.contractAddress === poolContractAddress) {
        currentPool = value;
      }
    });
    if (currentPool) {
      currentPool.assets.forEach((item: any) => {
        poolAssets.push(
          ASSETS.find(
            (assetItem) => assetItem.contractAddress === item.contractAddress
          )
        );
      });
    }
  }

  const ethBalanceDom = _.some(poolAssets, (item) => item.ticker === "ETH") ? (
    <EthBalance />
  ) : null;

  if (active && chainId) {
    let liquidityDom;

    if (!isStaPage) {
      liquidityDom = (
        <div>
          <div className={classes.title}>Liquidity</div>
          <TokenList
            chainId={chainId}
            assets={poolAssets}
            isLiquidity={false}
          />
        </div>
      );
    }

    let actionsDom;
    if (isStaPage) {
      actionsDom = (
        <div>
          <div className={classes.title}>Actions</div>
          {allowence > 0 ? (
            <>
              <StaButton
                onClick={Wrap}
                style={{
                  width: "100%",
                  marginBottom: "10px",
                }}
              >
                Wrap
              </StaButton>
              <StaButton
                onClick={UnWrap}
                style={{
                  width: "100%",
                  marginBottom: "10px",
                }}
              >
                UnWrap
              </StaButton>
            </>
          ) : (
            <StaButton
              onClick={approve}
              style={{
                width: "100%",
                marginBottom: "10px",
              }}
            >
              Allow
            </StaButton>
          )}
          <StaButton
            to="https://app.uniswap.org/#/swap?outputCurrency=0xa7de087329bfcda5639247f96140f9dabe3deed1"
            target="_blank"
            style={{
              width: "100%",
              marginBottom: "10px",
            }}
          >
            Trade STA
          </StaButton>

          <StaButton
            to="https://app.uniswap.org/#/swap?outputCurrency=0xedeec5691f23e4914cf0183a4196bbeb30d027a0"
            target="_blank"
            style={{
              width: "100%",
              marginBottom: "10px",
            }}
          >
            Trade wSTA
          </StaButton>
        </div>
      );
    } else {
      if (
        poolContractAddress === "0xa94700c1a1ae21324e78d5bdf6b2924e45a6068f"
      ) {
        // Dual asset
        // WARNING: Hardcoding links for STA/wSTA pool
        // TOOD: refactor
        actionsDom = (
          <div>
            <div className={classes.title}>Actions</div>
            <StaButton
              to="https://app.uniswap.org/#/add/0xa7de087329bfcda5639247f96140f9dabe3deed1/0xedeec5691f23e4914cf0183a4196bbeb30d027a0"
              target="_blank"
              style={{
                width: "100%",
                marginBottom: "10px",
              }}
            >
              Add Liquidity
            </StaButton>

            <StaButton
              to="https://app.uniswap.org/#/remove/0xa7de087329bfcda5639247f96140f9dabe3deed1/0xedeec5691f23e4914cf0183a4196bbeb30d027a0"
              target="_blank"
              style={{
                width: "100%",
                marginBottom: "10px",
              }}
            >
              Remove Liquidity
            </StaButton>
          </div>
        );
      } else {
        actionsDom = (
          <div>
            <div className={classes.title}>Actions</div>
            <StaButton
              to={`https://pools.balancer.exchange/#/pool/${poolContractAddress}`}
              target="_blank"
              style={{
                width: "100%",
                marginBottom: "10px",
              }}
            >
              Add/Remove Liquidity
            </StaButton>

            <StaButton
              to="https://claim.balancer.finance"
              target="_blank"
              style={{
                width: "100%",
                marginBottom: "10px",
              }}
            >
              Claim BAL Rewards
            </StaButton>
          </div>
        );
      }
    }

    return (
      <EthSWRConfig
        value={{
          provider: library,
          ABIs: new Map(ABIs(chainId)),
          refreshInterval: 30000,
        }}
      >
        <div
          className={cx(classes.container, {
            [classes.closed]: walletClosed,
          })}
        >
          <div className={classes.inner}>
            <div
              className={classes.header}
              onClick={() => {
                if (walletClosed) {
                  handleWalletChange(false);
                }
              }}
            >
              <div className={classes.walletStatus}>
                <WalletStatus
                  account={account}
                  onDisconnect={() => deactivate()}
                />
              </div>
              <div className={classes.headerTitle}>My Wallet</div>
              <div
                className={classes.closeIcon}
                onClick={() => handleWalletChange(!walletClosed)}
              />
            </div>

            <div className={classes.main}>
              <div className={classes.myWallet}>
                <div className={classes.title}>Balances</div>
                <div className={classes.tokenList}>
                  {ethBalanceDom}
                  <TokenList
                    chainId={chainId}
                    assets={poolAssets}
                    isLiquidity={false}
                  />
                </div>
              </div>

              <div className={classes.myLiquidity}>
                <div className={classes.tokenList}>{liquidityDom}</div>
              </div>

              <div className={classes.actions}>{actionsDom}</div>
            </div>
          </div>
        </div>
      </EthSWRConfig>
    );
  } else {
    return (
      <div
        className={cx(classes.container, classes.containerDisconnected, {
          [classes.closed]: walletClosed,
        })}
      >
        <div className={classes.inner}>
          <div
            className={classes.header}
            onClick={() => {
              if (walletClosed) {
                handleWalletChange(false);
              }
            }}
          >
            <div className={classes.walletStatus}>
              <WalletStatus />
            </div>
            <div className={classes.headerTitle}>My Wallet</div>
            <div
              className={classes.closeIcon}
              onClick={() => handleWalletChange(!walletClosed)}
            />
          </div>

          <div className={classes.connectContainer}>
            <div className={classes.connectContainerText}>
              Connect your wallet to see live balances and liquidity
            </div>
            <StaButton
              onClick={activateMetamask}
              style={{
                margin: "0 6px 10px",
              }}
            >
              Connect with Metamask
            </StaButton>

            <StaButton
              onClick={() => {
                activate(walletConnect, undefined, true);
              }}
              style={{
                margin: "0 6px 10px",
              }}
            >
              Connect with Walletconnect
            </StaButton>
          </div>
        </div>
      </div>
    );
  }
};

export default Wallet;
