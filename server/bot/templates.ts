export const templates = {
  welcome: `🏗️ Welcome to CemTemBot! 

I help you get instant pricing for cement and TMT bars from verified vendors in your city.

Are you a:
1 Buyer (looking for prices)
2 Vendor (want to provide quotes)

Reply with 1 or 2`,
  buyer: {
    getCity: `Great! I'll help you find prices in your city.

📍 Which city are you in?

Available cities: Guwahati, Mumbai, Delhi

Please enter your city name:`,
    getMaterial: (city: string) => `📍 City: ${city}

What are you looking for?

1 Cement
2 TMT Bars

Reply with 1 or 2:`,
    getBrand: (material: string) => `🏷️ Any specific brand preference?

For ${material}:
- Enter brand name (e.g., ACC, Ambuja, UltraTech)
- Or type "any" for any brand`,
    getQuantity: `📦 How much quantity do you need?

Examples:
- 50 bags
- 2 tons
- 100 pieces

Enter quantity:`,
    confirm: (inquiry: any) => `✅ Please confirm your inquiry:

📍 City: ${inquiry.city}
🏗️ Material: ${inquiry.material.toUpperCase()}
${inquiry.brand ? `Brand: ${inquiry.brand}` : 'Brand: Any'}
📦 Quantity: ${inquiry.quantity}

Reply "confirm" to send to vendors or "restart" to start over:`,
    inquirySent: (inquiry: any) => `🚀 Your inquiry has been sent!

We've contacted vendors in ${inquiry.city} for ${inquiry.material} pricing. You should receive quotes shortly via Telegram.

📊 Inquiry ID: INQ-${Date.now()}

Vendors will reply directly to you with quotes in this format:
💰 Rate: ₹X per unit
📊 GST: X%
🚚 Delivery: ₹X

Send /start for a new inquiry anytime!`,
  },
  vendor: {
    getName: `👨‍💼 Great! Let's register you as a vendor.

What's your business/company name?`,
    getCity: (name: string) => `📍 Business Name: ${name}

Which city do you operate in?

Available cities: Guwahati, Mumbai, Delhi

Enter your city:`,
    getMaterials: (city: string) => `📍 City: ${city}

What materials do you supply?

1 Cement only
2 TMT Bars only  
3 Both Cement and TMT Bars

Reply with 1, 2, or 3:`,
    getPhone: (materials: string[]) => `📋 Materials: ${materials.join(', ').toUpperCase()}

What's your contact phone number?

Enter your phone number (with country code if international):`,
    confirm: (vendor: any) => `✅ Please confirm your vendor registration:

🏢 Business: ${vendor.vendorName}
📍 City: ${vendor.vendorCity}
🏗️ Materials: ${vendor.materials.join(' and ').toUpperCase()}
📞 Phone: ${vendor.vendorPhone}

Reply "confirm" to register or "restart" to start over:`,
    registrationSuccess: (vendor: any) => `🎉 Vendor registration successful!

Welcome to our vendor network, ${vendor.vendorName}!

📋 Vendor ID: VEN-${Date.now()}

You'll start receiving pricing inquiries for ${vendor.materials.join(' and ').toUpperCase()} in ${vendor.vendorCity} via Telegram.

When you receive an inquiry, reply with your quote in this format:

**RATE: [Price] per [Unit]**
**GST: [Percentage]%**  
**DELIVERY: [Charges]**

Example:
RATE: 350 per bag
GST: 18%
DELIVERY: 50
Inquiry ID: INQ-123456789

Send /start anytime for help or to update your information.`,
  },
  general: {
    invalidOption: `Please select a valid option.`,
    restart: `🔄 Let's start over!

Are you a:
1 Buyer (looking for prices)
2 Vendor (want to provide quotes)

Reply with 1 or 2`,
    help: `🤖 PriceBot Help:

Commands:
/start - Start a new pricing inquiry
/help - Show this help message

For Vendors: To submit a quote, use this format:
**RATE: [Price] per [Unit]**
**GST: [Percentage]%**
**DELIVERY: [Charges]**

Example:
RATE: 350 per bag
GST: 18%
DELIVERY: 50
Inquiry ID: INQ-123456789

Simply send /start to begin!`,
  },
};