saya mau membuat sebuah tool dengan nodejs untuk melakukan sebuah transaksi onchain di chain base dengan flow berikut :

1. lakukan request inquiry dari token A ke token B
2. ketika sudah mendapatkan inquiry maka di cek approval nya sudah pernah di approve atau belum, nahh gunakan address pada tx.to pada response inquiry
3. inquiry lagi token B ke token A, jadi supaya cuma sekali bulk transaksi nantinya. flownya sama cuma beda di swap balik aja
4. borrow ammount dari flashloan, abinya sudah saya sediakan pada abis/flashloan.json
ini contoh code untuk flashloan
let estimateGas = await poc.utang(
    [TOKEN_ADDRESS],
    [amountBorrow],
    flashloanPayload,
    {
        gasPrice: 0.01 * 1e9
    }
)
TOKEN_ADDRESS tersebut adalah sell_tokens yg di gunakan pada request inquiry
amountBorrow tersebut adalah sell_amounts yang di gunakan pada request inquiry, untuk sementara amountBorrow di set 0 saja dulu gpp beda dengan sell_amounts tapi nanti saya bisa setting lagi
flashloanPayload ini bulk payload yang akan dikirim kan ke smart contract flashloannya
contoh codenya :
```js
const generatePayload = (amountBorrow, dataSwap1, dataSwap2) => {
    let result = []

    let payload1 = wethIface.encodeFunctionData("transfer", [signerUtama.address, amountBorrow])
    let payload2 = wethIface.encodeFunctionData("transferFrom", [signerUtama.address, contractAddr, amountBorrow]) // kirim balik wethnya
    let payload3 = wethIface.encodeFunctionData("approve", ["0x1111111254EEB25477B68fb85Ed929f73A960582", amountBorrow]) // approve router rainbow
    let payload4 = wethIface.encodeFunctionData("approve", ["0x1111111254EEB25477B68fb85Ed929f73A960582", amountBorrow]) // approve router rainbow
    
    result.push(
        [contractAddr, WETH, 0, payload3],
        [contractAddr, "0x1111111254EEB25477B68fb85Ed929f73A960582", 0, dataSwap1],
        [contractAddr, AWETH, 0, payload4],
        [contractAddr, "0x1111111254EEB25477B68fb85Ed929f73A960582", 0, dataSwap2],
        // [contractAddr, WETH, 0, payload1],
        [contractAddr, WETH, 0, payload2]
    )
    return JSON.stringify(result);
}
let flashloanPayloadArr = generatePayload(amountSwap, swap1.tx.data, swap2.tx.data)
let flashloanPayload = await poc.encodeData(JSON.parse(flashloanPayloadArr))
```

request inquiry : 
https://api.bebop.xyz/pmm/base/v3/quote?buy_tokens=0x4200000000000000000000000000000000000006&sell_tokens=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&sell_amounts=1000000&taker_address=0xbd1df00dD7021b1c21e44140150F5F5c5D800fBC&gasless=false&skip_validation=true

0xbd1df00dD7021b1c21e44140150F5F5c5D800fBC = wallet yg terhubung

response inquiry :
{
    "type": "121",
    "status": "SIG_SUCCESS",
    "quoteId": "121-74750553856800868450742703064218335142",
    "chainId": 8453,
    "approvalType": "Standard",
    "nativeToken": "ETH",
    "taker": "0xbd1df00dD7021b1c21e44140150F5F5c5D800fBC",
    "receiver": "0xbd1df00dD7021b1c21e44140150F5F5c5D800fBC",
    "expiry": 1746644767,
    "slippage": 0.0,
    "gasFee": {
        "native": "0",
        "usd": 0.0
    },
    "buyTokens": {
        "0x4200000000000000000000000000000000000006": {
            "amount": "549641041508403",
            "decimals": 18,
            "priceUsd": 1800.11,
            "symbol": "WETH",
            "minimumAmount": "549641041508403",
            "price": 1819.3692327917472,
            "priceBeforeFee": 1819.3692327917472,
            "amountBeforeFee": "549641041508403",
            "deltaFromExpected": -0.010518380020150143
        }
    },
    "sellTokens": {
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": {
            "amount": "1000000",
            "decimals": 6,
            "priceUsd": 0.999932,
            "symbol": "USDC",
            "price": 0.000549641041508403,
            "priceBeforeFee": 0.000549641041508403
        }
    },
    "settlementAddress": "0xbbbbbBB520d69a9775E85b458C58c648259FAD5F",
    "approvalTarget": "0xbbbbbBB520d69a9775E85b458C58c648259FAD5F",
    "requiredSignatures": [],
    "priceImpact": -0.010518380020150143,
    "warnings": [],
    "tx": {
        "to": "0xbbbbbBB520d69a9775E85b458C58c648259FAD5F",
        "value": "0x0",
        "data": "0x4dcebcba00000000000000000000000000000000000000000000000000000000681baf1f000000000000000000000000bd1df00dd7021b1c21e44140150f5f5c5d800fbc00000000000000000000000051c72848c68a965f66fa7a88855f9f7784502a7f0000000000000000000000000000000000000000000000000000032d54ef3711000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000420000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000001f3e547087833000000000000000000000000bd1df00dd7021b1c21e44140150f5f5c5d800fbc0000000000000000000000000000000000000000000000000000000000000000383c6ed94ccaa0b26378ca62b09bf77c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000418a9ffa29d4e7063304eee50ec838b9ce553b0c72afe4feca1fa17c921fe0dc5b23276fa3459141510fe05721487834f8851527d0314fdc3341168079b3f335f81c00000000000000000000000000000000000000000000000000000000000000",
        "from": "0xbd1df00dD7021b1c21e44140150F5F5c5D800fBC",
        "gas": 102415,
        "gasPrice": 2337167
    },
    "makers": [
        "🦊"
    ],
    "toSign": {
        "partner_id": 0,
        "expiry": 1746644767,
        "taker_address": "0xbd1df00dD7021b1c21e44140150F5F5c5D800fBC",
        "maker_address": "0x51C72848c68a965f66FA7a88855F9f7784502a7F",
        "maker_nonce": "3493233374993",
        "taker_token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "maker_token": "0x4200000000000000000000000000000000000006",
        "taker_amount": "1000000",
        "maker_amount": "549641041508403",
        "receiver": "0xbd1df00dD7021b1c21e44140150F5F5c5D800fBC",
        "packed_commands": "0"
    },
    "onchainOrderType": "SingleOrder",
    "partialFillOffset": 12
}