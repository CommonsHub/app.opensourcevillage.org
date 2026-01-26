# Tests

## Requirements
Start a local blockchain with hardhat.
Mint native tokens to PRIVATE_KEY.
Deploy the test ERC20 token. Save address where is it deployed.
Create a dummy author Xavier with its own nsec/npub/serial-number
Create a dummy workshop /workshops/nostr (author: Xavier)

## Claiming badge

go to BASE_URL/badges#123-32112-4324
set username
set password
click on claim
check that BASE_URL/username.json returns my 0x address and npub.
check that the balance of 0x address on the blockchain is 50.

## RSVP
go to BASE_URL/workshops/nostr 
click on RSVP
Make sure the balance is 49
Make sure the balance of Xavier is 1

