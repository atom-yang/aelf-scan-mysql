/**
 * @file insert
 * @author atom-yang
 */
const {
  Scanner
} = require('aelf-block-scan');
const AElf = require('aelf-sdk');
const Query = require('./sql/index');
const DBOperation = require('./dbOperation/index');
const { contractTokenFormatter } = require('./formatters/index');
const { config } = require('./common/constants');
const tps = require('./tps.js');
const { sendEmails } = require('./emails');

let customInsert;

class CustomInsert {
  constructor(options) {
    // process.stdin.resume(); // so the program will not close instantly
    // do something when app is closing
    // process.on('exit', this.cleanup);
    //
    // // catches ctrl+c event
    // process.on('SIGINT', this.cleanup);
    //
    // // catches "kill pid" (for example: nodemon restart)
    // process.on('SIGUSR1', this.cleanup);
    // process.on('SIGUSR2', this.cleanup);
    //
    // process.on('uncaughtException', err => {
    //   console.log(err);
    //   this.restart();
    // });
    this.config = options;
    this.aelf = new AElf(new AElf.providers.HttpProvider(this.config.scan.host, 3000));
    this.wallet = AElf.wallet.getWalletByPrivateKey(this.config.wallet.privateKey);
    this.scanner = null;
    this.sqlQuery = null;
    this.cleanup = this.cleanup.bind(this);
  }

  async init() {
    // 插入表中
    const tokenInfo = await this.getELFTokenInfo();
    this.sqlQuery = new Query(config.sql);
    await this.sqlQuery.insertContract(contractTokenFormatter(...tokenInfo));
    await this.sqlQuery.initCounts();
    const options = await this.getConfig();
    options.aelfInstance = this.aelf;
    this.scanner = new Scanner(new DBOperation({}, this.sqlQuery), options);
    try {
      await this.scanner.start();
      console.log('start loop');
      setTimeout(() => {
        console.log('start count tps');
        tps.init();
      }, 120000);
    } catch (err) {
      console.warn(JSON.stringify(err, null, 2));
      await sendEmails(err);
      throw err;
    }
  }

  cleanup() {
    console.log('cleanup');
    if (customInsert.sqlQuery) {
      customInsert.sqlQuery.close();
    }
    process.exit(1);
  }

  async getELFTokenInfo() {
    const {
      GenesisContractAddress,
      ChainId
    } = await this.aelf.chain.getChainStatus();
    const genesisContract = await this.aelf.chain.contractAt(GenesisContractAddress, this.wallet);
    const tokenAddress = await genesisContract
      .GetContractAddressByName.call(AElf.utils.sha256('AElf.ContractNames.Token'));
    const tokenContract = await this.aelf.chain.contractAt(tokenAddress, this.wallet);
    const tokenInfo = await tokenContract.GetTokenInfo.call({
      symbol: 'ELF'
    });
    return [
      tokenAddress,
      ChainId,
      tokenInfo
    ];
  }

  async getConfig() {
    // 获取表中最大高度，获取表中缺失的高度列表
    const maxHeight = await this.sqlQuery.getMaxHeight();
    console.log(`max height in confirmed blocks ${maxHeight}`);
    const missingHeights = await this.sqlQuery.getMissingHeights();
    console.log(`missing heights in confirmed blocks ${JSON.stringify(missingHeights)}`);
    return {
      ...config.scan,
      startHeight: maxHeight + 1,
      missingHeightList: missingHeights.slice()
    };
  }

  async restart() {
    tps.stop();
    await this.init();
  }
}

customInsert = new CustomInsert(config);

customInsert.init();
