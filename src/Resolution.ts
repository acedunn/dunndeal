import Ens from './ens';
import Zns from './zns';
import Cns from './cns';
import Udapi from './unstoppableAPI';
import {
  Blockchain,
  UnclaimedDomainResponse,
  ResolutionResponse,
  DefaultAPI,
  API,
  nodeHash,
  NamingServiceName,
  Web3Version0Provider,
  Web3Version1Provider,
  Provider,
  NamingServiceSource,
  SourceDefinition,
  EthersProvider,
} from './types';
import ResolutionError, { ResolutionErrorCode } from './errors/resolutionError';
import NamingService from './namingService';
import { signedInfuraLink } from './utils';
import { Eip1993Factories } from './utils/Eip1993Factories';

/**
 * Blockchain domain Resolution library - Resolution.
 * @example
 * ```
 * import Resolution from '@unstoppabledomains/resolution';
 *
 * let resolution = new Resolution({ blockchain: {
 *        ens: {
 *           url: "https://mainnet.infura.io/v3/12351245223",
 *           network: "mainnet"
 *        }
 *      }
 *   });
 *
 * let domain = "brad.zil";
 * resolution.address(domain, "eth").then(addr => console.log(addr));;
 * ```
 */
export default class Resolution {
  /**
   * @returns true if weather resolution library is configured to use blockchain for resolution.
   */
  readonly blockchain: boolean;
  /** @internal */
  readonly ens?: Ens;
  /** @internal */
  readonly zns?: Zns;
  /** @internal */
  readonly cns?: Cns;
  /** @internal */
  readonly api?: Udapi;

  constructor({
    blockchain = true,
    api = DefaultAPI,
  }: { blockchain?: Blockchain | boolean; api?: API } = {}) {
    this.blockchain = !!blockchain;
    if (blockchain) {
      if (blockchain === true) {
        blockchain = {};
      }
      const web3provider = blockchain.web3Provider;
      if (web3provider) {
        console.warn(
          'Usage of `web3Provider` option is deprecated. Use `provider` option instead for each individual blockchain',
        );
      }
      const ens = this.normalizeSource(blockchain.ens, web3provider);
      const zns = this.normalizeSource(blockchain.zns);
      const cns = this.normalizeSource(blockchain.cns, web3provider);

      if (ens) {
        this.ens = new Ens(ens);
      }
      if (zns) {
        this.zns = new Zns(zns);
      }
      if (cns) {
        this.cns = new Cns(cns);
      }
    } else {
      this.api = new Udapi(api);
    }
  }

  /**
   * Creates a resolution with configured infura id for ens and cns
   * @param infura infura project id
   * @param network ethereum network name
   */
  static infura(infura: string, network: string = 'mainnet'): Resolution {
    return new this({
      blockchain: {
        ens: { url: signedInfuraLink(infura, network), network },
        cns: { url: signedInfuraLink(infura, network), network },
      },
    });
  }

  /**
   * Creates a resolution instance with configured provider
   * @param provider - any provider compatible with EIP-1193
   * @see https://eips.ethereum.org/EIPS/eip-1193
   */
  static fromEip1193Provider(provider: Provider): Resolution {
    return new this({
      blockchain: { zns: true, ens: { provider }, cns: { provider } },
    });
  }

  /**
   * Create a resolution instance from web3 0.x version provider
   * @param provider - an 0.x version provider from web3 ( must implement sendAsync(payload, callback) )
   * @see https://github.com/ethereum/web3.js/blob/0.20.7/lib/web3/httpprovider.js#L116
   */
  static fromWeb3Version0Provider(provider: Web3Version0Provider): Resolution {
    return this.fromEip1193Provider(Eip1993Factories.fromWeb3Version0Provider(provider));
  }

  /**
   * Create a resolution instance from web3 1.x version provider
   * @param provider - an 1.x version provider from web3 ( must implement send(payload, callback) )
   * @see https://github.com/ethereum/web3.js/blob/1.x/packages/web3-core-helpers/types/index.d.ts#L165
   * @see https://github.com/ethereum/web3.js/blob/1.x/packages/web3-providers-http/src/index.js#L95
   */
  static fromWeb3Version1Provider(provider: Web3Version1Provider): Resolution {
    return this.fromEip1193Provider(Eip1993Factories.fromWeb3Version1Provider(provider));
  }

  /**
   * Creates instance of resolution from provider that implements Ethers Provider#call interface.
   * This wrapper support only `eth_call` method for now, which is enough for all the current Resolution functionality
   * @param provider - provider object
   * @see https://github.com/ethers-io/ethers.js/blob/v4-legacy/providers/abstract-provider.d.ts#L91
   * @see https://github.com/ethers-io/ethers.js/blob/v5.0.4/packages/abstract-provider/src.ts/index.ts#L224
   * @see https://docs.ethers.io/ethers.js/v5-beta/api-providers.html#jsonrpcprovider-inherits-from-provider
   * @see https://github.com/ethers-io/ethers.js/blob/master/packages/providers/src.ts/json-rpc-provider.ts
   */
  static fromEthersProvider(provider: EthersProvider): Resolution {
    return this.fromEip1193Provider(Eip1993Factories.fromEthersProvider(provider));
  }

  /**
   * Resolves the given domain
   * @async
   * @param domain - domain name to be resolved
   * @returns A promise that resolves in an object
   */
  async resolve(domain: string): Promise<ResolutionResponse> {
    domain = this.prepareDomain(domain);
    const method = this.getNamingMethodOrThrow(domain);
    const result = await method.resolve(domain);
    return result || UnclaimedDomainResponse;
  }

  /**
   * Resolves give domain name to a specific currency address if exists
   * @async
   * @param domain - domain name to be resolved
   * @param currencyTicker - currency ticker like BTC, ETH, ZIL
   * @returns A promise that resolves in an address or null
   */
  async address(
    domain: string,
    currencyTicker: string,
  ): Promise<string | null> {
    domain = this.prepareDomain(domain);
    try {
      return await this.addressOrThrow(domain, currencyTicker);
    } catch (error) {
      if (error instanceof ResolutionError) {
        return null;
      } else {
        throw error;
      }
    }
  }

  /**
   * Resolve a chat id from the domain record
   * @param domain - domain name to be resolved
   * @throws [[ResolutionError]]
   * @returns A promise that resolves in chatId
   */
  async chatId(domain: string): Promise<string> {
    domain = this.prepareDomain(domain);
    const method = this.getNamingMethodOrThrow(domain);
    return await method.chatId(domain);
  }

  /**
   * Resolve a gundb public key from the domain record
   * @param domain - domain name to be resolved
   * @throws [[ResolutionError]]
   * @returns a promise that resolves in gundb public key
   */
  async chatPk(domain: string): Promise<string> {
    domain = this.prepareDomain(domain);
    const method = this.getNamingMethodOrThrow(domain);
    return await method.chatpk(domain);
  }

  /**
   * Resolves the IPFS hash configured for domain records on ZNS
   * @param domain - domain name
   * @throws [[ResolutionError]]
   */
  async ipfsHash(domain: string): Promise<string> {
    domain = this.prepareDomain(domain);
    return await this.getNamingMethodOrThrow(domain).ipfsHash(domain);
  }

  /**
   * Resolves the httpUrl attached to domain
   * @param domain - domain name
   */
  async httpUrl(domain: string): Promise<string> {
    domain = this.prepareDomain(domain);
    return await this.getNamingMethodOrThrow(domain).httpUrl(domain);
  }

  /**
   * Resolves the ipfs redirect url for a supported domain records
   * @deprecated use Resolution#httpUrl instead
   * @param domain - domain name
   * @throws [[ResolutionError]]
   * @returns A Promise that resolves in redirect url
   */
  async ipfsRedirect(domain: string): Promise<string> {
    console.warn(
      'Resolution#ipfsRedirect is depricated since 1.0.15, use Resolution#httpUrl instead',
    );
    return await this.getNamingMethodOrThrow(domain).record(
      domain,
      'ipfs.redirect_domain.value',
    );
  }

  /**
   * Resolves the ipfs email field from whois configurations
   * @param domain - domain name
   * @throws [[ResolutionError]]
   * @returns A Promise that resolves in an email address configured for this domain whois
   */
  async email(domain: string): Promise<string> {
    domain = this.prepareDomain(domain);
    return await this.getNamingMethodOrThrow(domain).email(domain);
  }

  /**
   * @returns A specific currency address or throws an error
   * @param domain domain name
   * @param currencyTicker currency ticker such as
   *  - ZIL
   *  - BTC
   *  - ETH
   * @throws [[ResolutionError]] if address is not found
   */
  async addressOrThrow(
    domain: string,
    currencyTicker: string,
  ): Promise<string> {
    domain = this.prepareDomain(domain);
    const method = this.getNamingMethodOrThrow(domain);
    return await method.address(domain, currencyTicker);
  }

  /**
   * @returns the resolver address for a specific domain
   * @param domain - domain to look for
   */
  async resolver(domain: string): Promise<string> {
    domain = this.prepareDomain(domain);
    return await this.getNamingMethodOrThrow(domain).resolver(domain);
  }

  /**
   * @param domain - domain name
   * @returns An owner address of the domain
   */
  async owner(domain: string): Promise<string | null> {
    domain = this.prepareDomain(domain);
    const method = this.getNamingMethodOrThrow(domain);
    return (await method.owner(domain)) || null;
  }

  /**
   * @param domain - domain name
   * @param recordKey - a name of a record to be resolved
   * @returns A record value promise for a given record name
   */
  async record(domain: string, recordKey: string): Promise<string> {
    domain = this.prepareDomain(domain);
    const method = this.getNamingMethodOrThrow(domain);
    return await method.record(domain, recordKey);
  }

  /**
   * This method is only for ens at the moment. Reverse the ens address to a ens registered domain name
   * @async
   * @param address - address you wish to reverse
   * @param currencyTicker - currency ticker like BTC, ETH, ZIL
   * @returns Domain name attached to this address
   */
  async reverse(
    address: string,
    currencyTicker: string,
  ): Promise<string | null> {
    return (this.findNamingService(NamingServiceName.ENS) as Ens).reverse(address, currencyTicker);
  }

  /**
   * @returns Produces a namehash from supported naming service in hex format with 0x prefix.
   * Corresponds to ERC721 token id in case of Ethereum based naming service like ENS or CNS.
   * @param domain - domain name to be converted
   * @throws [[ResolutionError]] with UnsupportedDomain error code if domain extension is unknown
   */
  namehash(domain: string): string {
    domain = this.prepareDomain(domain);
    return this.getNamingMethodOrThrow(domain).namehash(domain);
  }

  /**
   * returns a childhash for specific namingService
   * @param parent hash for parent
   * @param label hash for label
   * @param method "ENS", "CNS" or "ZNS"
   */
  childhash(
    parent: nodeHash,
    label: string,
    method: NamingServiceName,
  ): nodeHash {
    return this.findNamingService(method).childhash(parent, label);
  }

  /**
   * Checks weather the domain name matches the hash
   * @param domain - domain name to check againt
   * @param hash - hash obtained from the blockchain
   */
  isValidHash(domain: string, hash: string): boolean {
    domain = this.prepareDomain(domain);
    return this.namehash(domain) === hash;
  }

  /**
   * Checks if the domain name is valid according to naming service rules
   * for valid domain names.
   * Example: ENS doesn't allow domains that start from '-' symbol.
   * @param domain - domain name to be checked
   */
  isSupportedDomain(domain: string): boolean {
    domain = this.prepareDomain(domain);
    return !!this.getNamingMethod(domain);
  }

  /**
   * Checks if the domain is supported by the specified network as well as if it is in valid format
   * @param domain - domain name to be checked
   */
  isSupportedDomainInNetwork(domain: string): boolean {
    domain = this.prepareDomain(domain);
    const method = this.getNamingMethod(domain);
    return !!method && method.isSupportedNetwork();
  }

  /**
   * Returns the name of the service for a domain ENS | CNS | ZNS
   * @param domain - domain name to look for
   */
  serviceName(domain: string): NamingServiceName {
    domain = this.prepareDomain(domain);
    return this.getNamingMethodOrThrow(domain).serviceName(domain);
  }

  /**
   * Returns all record keys of the domain.
   * Currently supports only CNS
   * @param domain - domain name 
   */
  async getAllKeys(domain: string): Promise<any> {
    domain = this.prepareDomain(domain);
    return await this.getNamingMethodOrThrow(domain).getAllKeys(domain);
  }

  private getNamingMethod(domain: string): NamingService | undefined {
    domain = this.prepareDomain(domain);
    return this.getResolutionMethods().find(
      method => method.isSupportedDomain(domain),
    );
  }

  private getResolutionMethods(): NamingService[] {
    return (this.blockchain
      ? [this.ens, this.zns, this.cns] as NamingService[]
      : [this.api] as NamingService[]).filter(v => v);
  }

  private getNamingMethodOrThrow(domain: string): NamingService {
    domain = this.prepareDomain(domain);
    const method = this.getNamingMethod(domain);
    if (!method)
      throw new ResolutionError(ResolutionErrorCode.UnsupportedDomain, {
        domain,
      });
    return method;
  }

  private findNamingService(name: NamingServiceName): NamingService {
    const service = this.getResolutionMethods().find(m => m.name === name)
    if (!service)
      throw new ResolutionError(ResolutionErrorCode.NamingServiceDown, {
        method: name,
      });
    return service;
  }

  private prepareDomain(domain: string): string {
    return domain ? domain.trim().toLowerCase() : '';
  }

  private normalizeSource(source: NamingServiceSource | undefined, provider?: Provider): SourceDefinition | false {
    switch (typeof source) {
      case 'undefined': {
        return {provider}
      }
      case 'boolean': {
        return source ? {provider} : false;
      }
      case 'string': {
        return { url: source };
      }
      case 'object': {
        return {provider, ...source};
      }
    }
    throw new Error('Unsupported configuration')
  }
}

export { Resolution };
