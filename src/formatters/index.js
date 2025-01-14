/**
 * @file formatter
 * @author atom-yang
 * @date 2019-07-23
 */
const Long = require('long');
const deserializeEvents = require('../deserialize/deserializeEvents');
const { config } = require('../common/constants');

function blockFormatter(block) {
  const { Header, Body, BlockHash } = block;
  const {
    PreviousBlockHash,
    ChainId,
    Height,
    MerkleTreeRootOfTransactions,
    MerkleTreeRootOfWorldState,
    Time
  } = Header;
  return {
    block_hash: BlockHash,
    pre_block_hash: PreviousBlockHash,
    chain_id: ChainId,
    block_height: Height,
    tx_count: Body.TransactionsCount,
    merkle_root_tx: MerkleTreeRootOfTransactions,
    merkle_root_state: MerkleTreeRootOfWorldState,
    time: Time
  };
}

/**
 * initial token create
 * @param {string} tokenAddress
 * @param {string} chainId
 * @param {Object} tokenInfo
 * @return {*[]}
 */
function contractTokenFormatter(tokenAddress, chainId, tokenInfo) {
  return [
    tokenAddress,
    chainId,
    'inner',
    'inner',
    tokenInfo.symbol,
    tokenInfo.tokenName,
    tokenInfo.totalSupply,
    tokenInfo.decimals
  ];
}

/**
 * token related transactions
 * @param {Object} tokenInfo
 * @param {string} chainId
 * @return {Object}
 */
function contractTokenRelatedFormatter(tokenInfo, chainId) {
  const {
    Transaction,
    BlockHash,
    TransactionId
  } = tokenInfo;
  const params = JSON.parse(Transaction.params);
  return {
    contract_address: Transaction.To,
    chain_id: chainId,
    block_hash: BlockHash,
    tx_id: TransactionId,
    symbol: params.symbol,
    name: params.tokenName,
    total_supply: params.totalSupply,
    decimals: params.decimals
  };
}

function resourceFormatter(transaction, block) {
  const {
    Status,
    Transaction,
    TransactionId
  } = transaction;
  const { From, MethodName } = Transaction;
  const params = JSON.parse(Transaction.params);
  const eventsDeserialize = deserializeEvents(transaction.Logs);
  const tradeDetail = eventsDeserialize.find(item => item.name === 'tokenTrade');
  return {
    tx_id: TransactionId,
    address: From,
    method: MethodName,
    type: params.symbol,
    resource: parseInt(params.amount || 0, 10),
    elf: tradeDetail && (new Long(tradeDetail.baseAmount)).toString() || 0,
    fee: tradeDetail && (new Long(tradeDetail.feeAmount)).toString() || 0,
    chain_id: block.chain_id,
    block_height: block.block_height,
    tx_status: Status,
    time: block.time
  };
}

function transactionFormatter(transaction, blockInfo) {
  const txInfo = transaction.Transaction;
  // 处理一些奇怪的返回
  if (typeof txInfo === 'string') {
    return {
      tx_id: `tx_id${new Date().getTime() + Math.ceil(Math.random() * 100)}`,
      params_to: `params_to${new Date().getTime() + Math.ceil(Math.random() * 500)}`,
      chain_id: blockInfo.chain_id,
      block_height: parseInt(blockInfo.block_height, 10),
      address_from: '',
      address_to: '',
      params: txInfo,
      method: '',
      block_hash: blockInfo.block_hash,
      // increment_id: 0,
      quantity: 0, // TODO: 链上为BigInt类型, 所有涉及交易的步骤后续都需要修改。
      tx_status: transaction.Status,
      time: blockInfo.time,
      logs: transaction.Logs
    };
  }

  const method = txInfo.MethodName;

  const output = {
    tx_id: transaction.TransactionId,
    params_to: '',
    chain_id: blockInfo.chain_id,
    block_height: parseInt(blockInfo.block_height, 10),
    address_from: txInfo.From,
    address_to: txInfo.To,
    params: '',
    method: txInfo.MethodName,
    block_hash: blockInfo.block_hash,
    quantity: 0, // TODO: 链上为BigInt类型, 所有涉及交易的步骤后续都需要修改。
    tx_status: transaction.Status,
    time: blockInfo.time,
    logs: transaction.Logs
  };

  // 这一套规则是针对token合约的。
  const tokenMethodCheck = ['Initialize', 'Transfer', 'InitialBalance', 'Create'].includes(txInfo.MethodName);

  if (txInfo.To === config.contracts.resource) {
    output.params = txInfo.Params;
  } else if (txInfo.To === config.contracts.token && tokenMethodCheck) {
    const params = JSON.parse(txInfo.Params);
    output.params = txInfo.Params;
    switch (method) {
      case 'Create':
        // 查支出时，需要排除掉method=Initialize这种情况。
        output.params_to = txInfo.To;
        output.quantity = params.totalSupply || 0;
        break;
      case 'Transfer':
        output.params_to = params.to || 'tx failed';
        output.quantity = params.amount || 0;
        break;
      default:
        break;
    }
  }
  return output;
}

module.exports = {
  blockFormatter,
  contractTokenFormatter,
  contractTokenRelatedFormatter,
  resourceFormatter,
  transactionFormatter
};
