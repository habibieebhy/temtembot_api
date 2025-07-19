import TelegramBot from 'node-telegram-bot-api';
import { storage } from "../storage";
import { AIService } from './aiService';


export interface TelegramBotConfig {
  token: string;
}

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private isActive: boolean = true;
  private userSessions: Map<string, any> = new Map();
  private quoteSessions: Map<string, any> = new Map();
  private standardQuotes: Map<string, any> = new Map();
  private autoQuoteTimers: Map<string, NodeJS.Timeout> = new Map();
  private standardQuoteSessions: Map<string, any> = new Map();
  private io: any = null;
  private socketSessions: Map<string, any> = new Map();
  private webUserSessions: Map<string, any> = new Map();
  private token: string;

  private aiService: AIService;

  constructor(config: TelegramBotConfig) {
    this.token = config.token;
    // ADD THIS LINE HERE ↓
    this.aiService = new AIService(process.env.OPENROUTER_API_KEY || '');
  }

  setSocketIO(io: any, socketSessions: Map<string, any>) {
    this.io = io;
    this.socketSessions = socketSessions;
    console.log('✅ Socket.IO instance set for Telegram bot');
  }

  async handleWebUserMessage(data: {
    sessionId: string;
    message: string;
    userId: string;
    socketId: string
  }): Promise<string | null> {
    try {
      console.log('🌐 Processing web user message:', data);
      // Store or update web user session
      this.webUserSessions.set(data.sessionId, {
        userId: data.userId,
        socketId: data.socketId,
        lastActivity: new Date(),
        sessionId: data.sessionId
      });
      // Create a mock Telegram message object for consistency
      const mockTelegramMessage = {
        message_id: Date.now(),
        from: {
          id: parseInt(data.sessionId.replace(/\D/g, '').slice(-9)) || 999999999, // Generate numeric ID from session
          first_name: data.userId.split('@')[0] || 'WebUser',
          username: data.userId,
          is_bot: false
        },
        chat: {
          id: parseInt(data.sessionId.replace(/\D/g, '').slice(-9)) || 999999999,
          type: 'private' as const
        },
        date: Math.floor(Date.now() / 1000),
        text: data.message,
        // Add web user flag
        isWebUser: true,
        webSessionId: data.sessionId
      };
      // Process the message using existing bot logic
      const response = await this.processUserMessage(mockTelegramMessage);

      return response;
    } catch (error) {
      console.error('❌ Error handling web user message:', error);
      return 'Sorry, I encountered an error processing your message. Please try again.';
    }
  }
  // Add this helper method to process user messages (web or Telegram)
  private async processUserMessage(msg: any): Promise<string | null> {
    const chatId = msg.chat.id;
    const text = msg.text;
    const isWebUser = msg.isWebUser || false;
    console.log(`📝 Processing message from ${isWebUser ? 'web user' : 'Telegram user'}:`, text);
    // Handle /start command
    if (text === '/start') {
      const welcomeMessage = `🏗️ Welcome to CemTemBot! 
I help you get quotes for construction materials like cement and TMT bars.
What can I help you with today?
• Get quotes for cement
• Get quotes for TMT bars  
• Check material rates
• Connect with verified vendors
Just tell me what materials you need!`;
      if (isWebUser) {
        return welcomeMessage;
      } else {
        await this.sendMessage(chatId, welcomeMessage);
        return null;
      }
    }
    // Handle material inquiries
    if (text.toLowerCase().includes('cement') || text.toLowerCase().includes('tmt') || text.toLowerCase().includes('quote')) {
      return await this.handleMaterialInquiry(msg, isWebUser);
    }
    // Handle location responses
    if (text.includes(':')) {
      return await this.handleLocationSelection(msg, isWebUser);
    }
    // Use existing AI service to classify message and respond appropriately
    try {
      const classification = await this.aiService.classifyMessageType(text);

      let response = "";
      switch (classification.messageType) {
        case 'customer_inquiry':
          response = `I can help you get quotes for construction materials! 
Which materials do you need?
• Cement
• TMT bars
• Both
Please let me know your requirements.`;
          break;
        case 'vendor_registration':
          response = `Great! I see you're a supplier. 
To register as a vendor, please provide:
• Your business name
• Materials you supply (cement/TMT)
• Service areas/cities
• Contact details
What materials do you supply?`;
          break;
        case 'vendor_rate_update':
          response = `I can help you update your rates. 
Please provide your current rates in this format:
• Cement: ₹350 per bag
• TMT: ₹48 per kg
• GST: 18%
• Delivery: ₹50
What are your current rates?`;
          break;
        case 'sale_entry':
          response = `I can help you record this sale. 
Please provide:
• Material sold (cement/TMT)
• Quantity
• Company/customer name
• Price per unit
• Location
Can you provide these details?`;
          break;
        default: // general_chat
          response = `Hello! I'm CemTemBot, here to help with construction material quotes and vendor services.
How can I assist you today?
• Get material quotes
• Register as a vendor
• Update your rates
• Record a sale
What would you like to do?`;
          break;
      }

      if (isWebUser) {
        return response;
      } else {
        await this.sendMessage(chatId, response);
        return null;
      }
    } catch (error) {
      console.error('AI service error:', error);
      const fallbackResponse = `I'm here to help with construction materials! 
You can:
• Request quotes for cement or TMT bars
• Register as a vendor
• Update material rates
• Get market information
How can I help you today?`;

      if (isWebUser) {
        return fallbackResponse;
      } else {
        await this.sendMessage(chatId, fallbackResponse);
        return null;
      }
    }
  }
  // Alternative: Add a simple chat completion method to your telegram service
  private async getSimpleChatResponse(userMessage: string): Promise<string> {
    try {
      // Use the existing AI service structure to get a general response
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are CemTemBot, a helpful assistant for construction material quotes. Keep responses brief, helpful, and focused on cement, TMT bars, and construction materials. Always guide users toward getting quotes or registering as vendors.'
            },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 150
        })
      });
      const result = await response.json();
      return result.choices[0].message.content || "I'm here to help with construction material quotes. What do you need?";
    } catch (error) {
      console.error('Chat completion error:', error);
      return "I'm here to help with construction materials. What do you need quotes for?";
    }
  }
  // Helper method for material inquiries
  private async handleMaterialInquiry(msg: any, isWebUser: boolean): Promise<string | null> {
    const text = msg.text.toLowerCase();
    let material = 'cement';

    if (text.includes('tmt')) {
      material = 'tmt';
    }
    const response = `Great! I'll help you get quotes for ${material}.
Which city/location do you need these materials in?
Please select your location from the dropdown or type: CityName:LocalityName
For example: Mumbai:Andheri or Delhi:Rohini`;
    if (isWebUser) {
      return response;
    } else {
      await this.sendMessage(msg.chat.id, response);
      return null;
    }
  }
  // Helper method for location selection
  private async handleLocationSelection(msg: any, isWebUser: boolean): Promise<string | null> {
    const [city, locality] = msg.text.split(':');

    const response = `📍 Location confirmed: ${city}, ${locality}
🔍 I'm now searching for available vendors in your area...
This may take a moment while I connect with our network of verified suppliers.`;
    // Simulate inquiry creation
    setTimeout(async () => {
      const inquiryId = `INQ-${Date.now()}`;
      const quoteResponse = `✅ Your inquiry has been created!
📋 **Inquiry Details:**
🏗️ Material: Cement
📍 Location: ${city}, ${locality}  
🆔 Inquiry ID: ${inquiryId}
🔄 I've sent your requirement to verified vendors in your area. You'll receive quotes shortly!
💡 **What happens next?**
• Vendors will review your requirement
• You'll receive competitive quotes
• Compare and choose the best offer`;
      if (isWebUser && msg.webSessionId) {
        // Send follow-up message to web user
        if (this.io) {
          this.io.to(msg.webSessionId).emit('bot-message', {
            sessionId: msg.webSessionId,
            message: quoteResponse
          });
        }
      } else {
        await this.sendMessage(msg.chat.id, quoteResponse);
      }
    }, 2000);
    if (isWebUser) {
      return response;
    } else {
      await this.sendMessage(msg.chat.id, response);
      return null;
    }
  }
  // Method to send messages to web users
  async sendMessageToWebUser(sessionId: string, message: string) {
    if (this.io) {
      this.io.to(sessionId).emit('bot-message', {
        sessionId,
        message
      });
      console.log(`📤 Sent message to web user ${sessionId}`);
    }
  }

  private initializeBot() {
    if (this.bot) return;

    const token = this.token || process.env.TELEGRAM_BOT_TOKEN;

    if (!token || token === "demo_token" || token === "") {
      console.error("❌ No valid Telegram bot token found!");
      console.error("Expected format: 1234567890:ABC...");
      console.error("Current token:", token ? token.substring(0, 10) + "..." : "undefined");
      console.error("Make sure TELEGRAM_BOT_TOKEN is set in your .env file");
      throw new Error("Telegram bot token is required");
    }

    console.log("🤖 Initializing Telegram bot with token:", token.substring(0, 10) + "...");

    try {
      // Enable polling to receive messages with better error handling
      this.bot = new TelegramBot(token, {
        polling: {
          interval: 300,
          autoStart: false,
          params: {
            timeout: 10
          }
        }
      });
    } catch (error) {
      console.error("❌ Failed to create Telegram bot:", error);
      throw error;
    }
  }

  async start(useWebhook = false) {
    try {
      // Initialize the bot when starting
      this.initializeBot();

      if (!this.bot) {
        throw new Error("Failed to initialize Telegram bot");
      }

      this.isActive = true;

      // Test the bot first
      const me = await this.bot.getMe();
      console.log('✅ Bot verified:', me.username, `(@${me.username})`);

      if (!useWebhook) {
        // Force stop any existing polling first
        try {
          if (this.bot.isPolling) {
            await this.bot.stopPolling();
            console.log('🛑 Stopped existing polling');
            // Wait a moment for cleanup
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (err) {
          console.log('No existing polling to stop');
        }

        // Start fresh polling
        await this.bot.startPolling();
        console.log('✅ Telegram bot started with polling');
        // Setup button handlers
        this.setupCallbackQueryHandlers();

        // ONLY ONE MESSAGE LISTENER - NO DUPLICATES
        this.bot.on('message', async (msg) => {
          // Skip non-text messages
          if (!msg.text) return;

          console.log('🔵 Telegram message received from:', msg.chat.id, ':', msg.text);

          // Check if this is a new user starting an inquiry
          if (msg.text === '/start' || !this.userSessions.get(msg.chat.id.toString())) {
            try {
              await storage.createNotification({
                message: `🔍 New inquiry started by user ${msg.chat.id}`,
                type: 'new_inquiry_started'
              });
              console.log('✅ New inquiry notification created');
            } catch (err) {
              console.error('❌ Failed to create new inquiry notification:', err);
            }
          }

          // Only create notifications for important business events
          try {
            // Vendor responding with quote/rate
            if (msg.text.includes('$') || msg.text.includes('rate') || msg.text.includes('quote') || msg.text.includes('price')) {
              await storage.createNotification({
                message: `💰 Vendor responded with quote: "${msg.text}"`,
                type: 'vendor_response'
              });
            }
            // New inquiry from potential customer
            else if (msg.text.includes('need') || msg.text.includes('looking for') || msg.text.includes('inquiry') || msg.text.includes('quote me')) {
              await storage.createNotification({
                message: `🔍 New inquiry received: "${msg.text}"`,
                type: 'new_inquiry'
              });
            }
            // No notification for random chit-chat!

          } catch (err) {
            console.error('Failed to create notification:', err);
          }

          this.handleIncomingMessage(msg);
        });

        // Error handling
        this.bot.on('error', (error) => {
          console.error('Telegram bot error:', error);
        });

        this.bot.on('polling_error', (error) => {
          console.error('Telegram polling error:', error);
        });
      } else {
        console.log('✅ Telegram bot initialized (webhook mode)');
      }

    } catch (error) {
      console.error("❌ Failed to start Telegram bot:", error);
      this.isActive = false;
      throw error;
    }
  }

  async stop() {
    this.isActive = false;
    if (this.bot) {
      try {
        await this.bot.stopPolling();
        console.log("Telegram bot stopped");
      } catch (error) {
        console.error("Error stopping bot:", error);
      }
    }
  }
  async setupWebhook(webhookUrl: string) {
    try {
      this.initializeBot();

      if (!this.bot) {
        throw new Error("Bot not initialized");
      }

      // Stop polling if it's running
      if (this.bot.isPolling) {
        await this.bot.stopPolling();
        console.log('🛑 Stopped polling');
      }

      // Set the webhook
      await this.bot.setWebHook(webhookUrl);
      console.log('✅ Webhook set to:', webhookUrl);

      // Verify webhook
      const info = await this.bot.getWebHookInfo();
      console.log('🔗 Webhook info:', info);

      return info;
    } catch (error) {
      console.error('❌ Failed to setup webhook:', error);
      throw error;
    }
  }

  async processWebhookUpdate(update: any) {
    try {
      if (update.message && update.message.text) {
        console.log('🔵 Webhook message received from:', update.message.chat.id, ':', update.message.text);

        // Your existing notification logic
        if (update.message.text === '/start' || !this.userSessions.get(update.message.chat.id.toString())) {
          try {
            await storage.createNotification({
              message: `🔍 New inquiry started by user ${update.message.chat.id}`,
              type: 'new_inquiry_started'
            });
          } catch (err) {
            console.error('❌ Failed to create notification:', err);
          }
        }

        // Process business events  
        if (update.message.text.includes('$') || update.message.text.includes('rate') || update.message.text.includes('quote') || update.message.text.includes('price')) {
          await storage.createNotification({
            message: `💰 Vendor responded with quote: "${update.message.text}"`,
            type: 'vendor_response'
          });
        } else if (update.message.text.includes('need') || update.message.text.includes('looking for') || update.message.text.includes('inquiry') || update.message.text.includes('quote me')) {
          await storage.createNotification({
            message: `🔍 New inquiry received: "${update.message.text}"`,
            type: 'new_inquiry'
          });
        }

        // Handle the message using existing logic
        await this.handleIncomingMessage(update.message);
      }
    } catch (error) {
      console.error('❌ Error processing webhook update:', error);
    }
  }

  async testBot() {
    try {
      this.initializeBot();
      if (!this.bot) {
        throw new Error("Bot not initialized");
      }
      const me = await this.bot.getMe();
      console.log('🤖 Bot info:', me);
      return me;
    } catch (error) {
      console.error('❌ Bot token error:', error);
      return null;
    }
  }

  async handleVendorRateResponse(msg: any) {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Check if this is a rate response (contains RATE keyword and inquiry ID)
    const ratePattern = /RATE:\s*([0-9]+(?:\.[0-9]+)?)\s*per\s*(\w+)/i;
    const gstPattern = /GST:\s*([0-9]+(?:\.[0-9]+)?)%/i;
    const deliveryPattern = /DELIVERY:\s*([0-9]+(?:\.[0-9]+)?)/i;
    const inquiryPattern = /Inquiry ID:\s*(INQ-[0-9]+)/i;

    const rateMatch = text.match(ratePattern);
    const gstMatch = text.match(gstPattern);
    const deliveryMatch = text.match(deliveryPattern);
    const inquiryMatch = text.match(inquiryPattern);

    if (rateMatch && inquiryMatch) {
      const rate = parseFloat(rateMatch[1]);
      const unit = rateMatch[2];
      const gst = gstMatch ? parseFloat(gstMatch[1]) : 0;
      const delivery = deliveryMatch ? parseFloat(deliveryMatch[1]) : 0;
      const inquiryId = inquiryMatch[1];

      console.log(`📋 Rate response received from ${chatId}:`, {
        rate, unit, gst, delivery, inquiryId
      });

      // Process the rate submission
      await this.processVendorRateSubmission(chatId, {
        inquiryId,
        rate,
        unit,
        gst,
        delivery
      });

      // Confirm receipt to vendor
      await this.sendMessage(chatId, `✅ Thank you! Your quote has been received and sent to the buyer.
      
📋 Your Quote:
💰 Rate: ₹${rate} per ${unit}
📊 GST: ${gst}%
🚚 Delivery: ₹${delivery}
      
Inquiry ID: ${inquiryId}`);
      try {
        await storage.createNotification({
          message: `✅ Vendor quote received: ${rate} per ${unit} (Inquiry #${inquiryId})`,
          type: 'vendor_quote_confirmed'
        });
      } catch (err) {
        console.error('Failed to create notification:', err);
      }
      return true;
    }

    return false;
  }

  private setupCallbackQueryHandlers() {
    if (!this.bot) return;

    this.bot.on('callback_query', async (callbackQuery) => {
      const chatId = callbackQuery.message?.chat.id;
      const data = callbackQuery.data;

      if (!chatId || !data) return;

      try {
        if (data.startsWith('quote_')) {
          await this.handleQuoteStart(chatId, data, callbackQuery.message!.message_id);
        } else if (data.startsWith('rate_')) {
          await this.handleRateSelection(chatId, data, callbackQuery.message!.message_id);
        } else if (data.startsWith('gst_')) {
          await this.handleGstSelection(chatId, data, callbackQuery.message!.message_id);
        } else if (data.startsWith('delivery_')) {
          await this.handleDeliverySelection(chatId, data, callbackQuery.message!.message_id);
        } else if (data.startsWith('confirm_')) {
          await this.handleQuoteConfirm(chatId, data, callbackQuery.message!.message_id);
        } else if (data.startsWith('std_confirm_')) {
          const vendorId = data.replace('std_confirm_', '');
          const quotes = this.standardQuotes.get(vendorId);

          if (quotes) {
            await this.bot!.sendMessage(chatId,
              `✅ **Standard rates confirmed!**\n\nYour rates are now active and will be sent automatically to new inquiries.\n\n📊 Current Rates:\n💰 Cement: ₹${quotes.cement}/bag\n🔩 TMT: ₹${quotes.tmt}/kg\n📊 GST: ${quotes.gst}%\n🚚 Delivery: ₹${quotes.delivery}`
            );
          }
        }

        await this.bot!.answerCallbackQuery(callbackQuery.id);
      } catch (error) {
        console.error('Error handling button click:', error);
        await this.bot!.answerCallbackQuery(callbackQuery.id, {
          text: 'Error occurred. Please try again.'
        });
      }
    });
  }

  private async handleQuoteStart(chatId: number, data: string, messageId: number) {
    const inquiryId = data.replace('quote_', '');

    // Store session
    const sessionKey = `quote_session_${chatId}`;
    this.quoteSessions.set(sessionKey, { inquiryId, step: 'rate', messageId });

    // Get material type from inquiry
    const inquiry = await storage.getInquiryById(inquiryId);
    const material = inquiry?.material?.toLowerCase() || 'cement';

    let rateButtons;
    if (material === 'cement') {
      rateButtons = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "₹300", callback_data: `rate_300_${inquiryId}` },
              { text: "₹320", callback_data: `rate_320_${inquiryId}` },
              { text: "₹350", callback_data: `rate_350_${inquiryId}` }
            ],
            [
              { text: "₹380", callback_data: `rate_380_${inquiryId}` },
              { text: "₹400", callback_data: `rate_400_${inquiryId}` },
              { text: "💬 Custom", callback_data: `rate_custom_${inquiryId}` }
            ]
          ]
        }
      };
    } else if (material === 'tmt') {
      rateButtons = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "₹45/kg", callback_data: `rate_45_${inquiryId}` },
              { text: "₹48/kg", callback_data: `rate_48_${inquiryId}` },
              { text: "₹52/kg", callback_data: `rate_52_${inquiryId}` }
            ],
            [
              { text: "₹55/kg", callback_data: `rate_55_${inquiryId}` },
              { text: "₹60/kg", callback_data: `rate_60_${inquiryId}` },
              { text: "💬 Custom", callback_data: `rate_custom_${inquiryId}` }
            ]
          ]
        }
      };
    } else {
      rateButtons = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "₹100", callback_data: `rate_100_${inquiryId}` },
              { text: "₹200", callback_data: `rate_200_${inquiryId}` },
              { text: "₹300", callback_data: `rate_300_${inquiryId}` }
            ],
            [
              { text: "₹500", callback_data: `rate_500_${inquiryId}` },
              { text: "₹1000", callback_data: `rate_1000_${inquiryId}` },
              { text: "💬 Custom", callback_data: `rate_custom_${inquiryId}` }
            ]
          ]
        }
      };
    }

    await this.bot!.editMessageText(
      `🧱 **${material.toUpperCase()} Quote - Step 1/3: Rate**\n\nSelect your rate per unit:`,
      { chat_id: chatId, message_id: messageId, ...rateButtons }
    );
  }

  private async handleRateSelection(chatId: number, data: string, messageId: number) {
    const [, rate, inquiryId] = data.split('_');

    if (rate === 'custom') {
      await this.bot!.editMessageText(
        "💰 **Custom Rate**\n\nPlease type your rate (e.g. 350, 1250):",
        { chat_id: chatId, message_id: messageId }
      );

      const sessionKey = `quote_session_${chatId}`;
      const session = this.quoteSessions.get(sessionKey) || {};
      session.waitingForCustom = 'rate';
      session.messageId = messageId;
      this.quoteSessions.set(sessionKey, session);
      return;
    }

    // Store rate and move to GST
    const sessionKey = `quote_session_${chatId}`;
    const session = this.quoteSessions.get(sessionKey) || {};
    session.rate = rate;
    session.step = 'gst';
    this.quoteSessions.set(sessionKey, session);

    const gstButtons = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "0%", callback_data: `gst_0_${inquiryId}` },
            { text: "5%", callback_data: `gst_5_${inquiryId}` },
            { text: "12%", callback_data: `gst_12_${inquiryId}` }
          ],
          [
            { text: "18%", callback_data: `gst_18_${inquiryId}` },
            { text: "28%", callback_data: `gst_28_${inquiryId}` },
            { text: "💬 Custom", callback_data: `gst_custom_${inquiryId}` }
          ]
        ]
      }
    };

    await this.bot!.editMessageText(
      `✅ **Rate:** ₹${rate}\n\n📊 **Step 2/3: GST**\n\nSelect GST percentage:`,
      { chat_id: chatId, message_id: messageId, ...gstButtons }
    );
  }

  private async handleGstSelection(chatId: number, data: string, messageId: number) {
    const [, gst, inquiryId] = data.split('_');

    if (gst === 'custom') {
      await this.bot!.editMessageText(
        "📊 **Custom GST**\n\nPlease type GST percentage (e.g. 18, 15.5):",
        { chat_id: chatId, message_id: messageId }
      );

      const sessionKey = `quote_session_${chatId}`;
      const session = this.quoteSessions.get(sessionKey) || {};
      session.waitingForCustom = 'gst';
      this.quoteSessions.set(sessionKey, session);
      return;
    }

    // Store GST and move to delivery
    const sessionKey = `quote_session_${chatId}`;
    const session = this.quoteSessions.get(sessionKey) || {};
    session.gst = gst;
    session.step = 'delivery';
    this.quoteSessions.set(sessionKey, session);

    const deliveryButtons = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Free", callback_data: `delivery_0_${inquiryId}` },
            { text: "₹50", callback_data: `delivery_50_${inquiryId}` },
            { text: "₹100", callback_data: `delivery_100_${inquiryId}` }
          ],
          [
            { text: "₹150", callback_data: `delivery_150_${inquiryId}` },
            { text: "₹200", callback_data: `delivery_200_${inquiryId}` },
            { text: "💬 Custom", callback_data: `delivery_custom_${inquiryId}` }
          ]
        ]
      }
    };

    await this.bot!.editMessageText(
      `✅ **Rate:** ₹${session.rate}\n✅ **GST:** ${gst}%\n\n🚚 **Step 3/3: Delivery**\n\nSelect delivery charges:`,
      { chat_id: chatId, message_id: messageId, ...deliveryButtons }
    );
  }

  private async handleDeliverySelection(chatId: number, data: string, messageId: number) {
    const [, delivery, inquiryId] = data.split('_');

    if (delivery === 'custom') {
      await this.bot!.editMessageText(
        "🚚 **Custom Delivery**\n\nPlease type delivery charges (e.g. 150, 300):",
        { chat_id: chatId, message_id: messageId }
      );

      const sessionKey = `quote_session_${chatId}`;
      const session = this.quoteSessions.get(sessionKey) || {};
      session.waitingForCustom = 'delivery';
      this.quoteSessions.set(sessionKey, session);
      return;
    }

    // Store delivery and show confirmation
    const sessionKey = `quote_session_${chatId}`;
    const session = this.quoteSessions.get(sessionKey) || {};
    session.delivery = delivery;
    session.step = 'confirm';
    this.quoteSessions.set(sessionKey, session);

    const confirmButtons = {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Submit Quote", callback_data: `confirm_${inquiryId}` }
        ]]
      }
    };

    await this.bot!.editMessageText(
      `📋 **Quote Summary**\n\n💰 **Rate:** ₹${session.rate}\n📊 **GST:** ${session.gst}%\n🚚 **Delivery:** ₹${delivery}\n\n**Ready to submit?**`,
      { chat_id: chatId, message_id: messageId, ...confirmButtons }
    );
  }

  private async handleQuoteConfirm(chatId: number, data: string, messageId: number) {
    const inquiryId = data.replace('confirm_', '');

    const sessionKey = `quote_session_${chatId}`;
    const session = this.quoteSessions.get(sessionKey);

    if (!session) {
      await this.bot!.editMessageText("❌ Session expired. Please start over.",
        { chat_id: chatId, message_id: messageId });
      return;
    }

    // Submit the quote
    await this.processVendorRateSubmission(chatId, {
      inquiryId: inquiryId,
      rate: session.rate,
      unit: 'unit',
      gst: session.gst,
      delivery: session.delivery
    });

    await this.bot!.editMessageText(
      `✅ **Quote Submitted Successfully!**\n\n📋 Final quote:\n💰 Rate: ₹${session.rate}\n📊 GST: ${session.gst}%\n🚚 Delivery: ₹${session.delivery}\n\nSent to buyer!`,
      { chat_id: chatId, message_id: messageId }
    );

    // Clear session
    this.quoteSessions.delete(sessionKey);
  }
  private async processVendorRateSubmission(chatId: number, rateData: any) {
    try {
      // 🔥 CANCEL AUTO-TIMER when vendor sends manual quote
      const inquiryId = rateData.inquiryId;
      if (this.autoQuoteTimers.has(inquiryId)) {
        clearTimeout(this.autoQuoteTimers.get(inquiryId));
        this.autoQuoteTimers.delete(inquiryId);
        console.log(`⏹️ Cancelled auto-timer for ${inquiryId} - vendor sent manual quote`);
      }

      // Find the vendor by telegram ID
      const vendor = await storage.getVendorByTelegramId(chatId.toString());
      if (!vendor) {
        console.log(`❌ Vendor not found for chat ID: ${chatId}`);
        return;
      }

      // Find the inquiry
      const inquiry = await storage.getInquiryById(rateData.inquiryId);
      if (!inquiry) {
        console.log(`❌ Inquiry not found: ${rateData.inquiryId}`);
        return;
      }

      // Save the rate response
      await storage.createPriceResponse({
        vendorId: vendor.vendorId,
        inquiryId: rateData.inquiryId,
        material: inquiry.material,
        price: rateData.rate.toString(),
        gst: rateData.gst.toString(),
        deliveryCharge: rateData.delivery.toString()
      });

      console.log(`✅ Rate saved for vendor ${vendor.name}`);

      // Update inquiry response count
      await storage.incrementInquiryResponses(rateData.inquiryId);

      // Send compiled quote to buyer
      await this.sendCompiledQuoteToBuyer(inquiry, rateData, vendor);

    } catch (error) {
      console.error('Error processing vendor rate:', error);
    }
  }

  private async sendCompiledQuoteToBuyer(inquiry: any, rateData: any, vendor: any) {
    const buyerMessage = `🏗️ **New Quote Received!**

For your inquiry: ${inquiry.material.toUpperCase()}
📍 City: ${inquiry.city}
📦 Quantity: ${inquiry.quantity}

💼 **Vendor: ${vendor.name}**
💰 Rate: ₹${rateData.rate} per ${rateData.unit}
📊 GST: ${rateData.gst}%
🚚 Delivery: ₹${rateData.delivery}
📞 Contact: ${vendor.phone}

Inquiry ID: ${inquiry.inquiryId}

More quotes may follow from other vendors!`;

    try {
      // Send to buyer via their platform (telegram in this case)
      if (inquiry.platform === 'telegram') {
        await this.sendMessage(parseInt(inquiry.userPhone), buyerMessage);
      }
      // Add WhatsApp buyer notification here later

      console.log(`✅ Quote sent to buyer for inquiry ${inquiry.inquiryId}`);
      try {
        await storage.createNotification({
          message: `📤 Quote forwarded to buyer for inquiry #${inquiry.inquiryId}`,
          type: 'quote_sent_to_buyer'
        });
      } catch (err) {
        console.error('Failed to create notification:', err);
      }
    } catch (error) {
      console.error('Error sending quote to buyer:', error);
    }
  }

  private async handleCustomQuoteInput(chatId: number, text: string, session: any) {
    const numericValue = parseFloat(text);

    if (isNaN(numericValue) || numericValue < 0) {
      await this.sendMessage(chatId, "❌ Please enter a valid number. Try again:");
      return;
    }

    const sessionKey = `quote_session_${chatId}`;
    const inquiryId = session.inquiryId;

    if (session.waitingForCustom === 'rate') {
      // Simulate clicking a rate button with custom value
      session.waitingForCustom = null;
      this.quoteSessions.set(sessionKey, session);

      // Call the same handler as if they clicked a rate button
      await this.handleRateSelection(chatId, `rate_${numericValue}_${inquiryId}`, session.messageId || 0);

    } else if (session.waitingForCustom === 'gst') {
      // Simulate clicking a GST button with custom value
      session.waitingForCustom = null;
      this.quoteSessions.set(sessionKey, session);

      // Call the same handler as if they clicked a GST button
      await this.handleGstSelection(chatId, `gst_${numericValue}_${inquiryId}`, session.messageId || 0);

    } else if (session.waitingForCustom === 'delivery') {
      // Simulate clicking a delivery button with custom value
      session.waitingForCustom = null;
      this.quoteSessions.set(sessionKey, session);

      // Call the same handler as if they clicked a delivery button
      await this.handleDeliverySelection(chatId, `delivery_${numericValue}_${inquiryId}`, session.messageId || 0);
    }
  }

  async handleIncomingMessage(msg: any) {
    try {
      // Use the new unified message processing
      await this.processUserMessage(msg);

    } catch (error) {
      console.error('Error handling incoming message:', error);
      await this.sendMessage(msg.chat.id, 'Sorry, I encountered an error. Please try again.');
    }
  }
  // 🆕 NEW: Handle API messages separately
  async handleApiMessage(chatId: number, fullText: string) {
    try {
      // Extract the real message (remove [API] prefix and parse metadata)
      const parts = fullText.split('\n');
      const apiPart = parts[0]; // [API] Session: xxx | User: xxx
      const actualMessage = parts.slice(1).join('\n');

      // Parse session and user info
      const sessionMatch = apiPart.match(/Session: ([\w-]+)/);
      const userMatch = apiPart.match(/User: ([\w_]+)/);

      const sessionId = sessionMatch ? sessionMatch[1] : 'unknown';
      const userId = userMatch ? userMatch[1] : 'unknown';

      console.log(`📱 API Message received - Session: ${sessionId}, User: ${userId}`);

      // Format response for API messages
      const response = `💬 **Customer Support Message**

**Session ID:** \`${sessionId}\`
**User ID:** \`${userId}\`
**Message:** ${actualMessage}

---
*This message was sent via API. Reply to this chat to respond to the customer.*`;

      await this.sendMessage(chatId, response);
    } catch (error) {
      console.error('Error handling API message:', error);
      await this.sendMessage(chatId, '❌ Error processing API message');
    }
  }
  private async processInquiry(chatId: number, session: any) {

    console.log(`🔍 DEBUG: Looking for vendors in ${session.city} for ${session.material}`);

    // Find suitable vendors
    const vendors = await storage.getVendors(session.city, session.material);
    console.log(`🔍 DEBUG: Found ${vendors.length} vendors:`, vendors.map(v => ({
      name: v.name,
      city: v.city,
      materials: v.materials,
      telegramId: v.telegramId
    })));

    const selectedVendors = vendors.slice(0, 3);
    const inquiryId = `INQ-${Date.now()}`;
    const timer = setTimeout(async () => {
      await this.sendStandardQuotesToBuyer(chatId, session, inquiryId);
    }, 30000);
    console.log(`🔍 DEBUG: Selected ${selectedVendors.length} vendors for messaging`);
    this.autoQuoteTimers.set(inquiryId, timer);

    if (selectedVendors.length > 0) {
      // Create inquiry record
      await storage.createInquiry({
        inquiryId,
        userName: "Telegram User",
        userPhone: chatId.toString(),
        city: session.city,
        material: session.material,
        brand: session.brand,
        quantity: session.quantity,
        vendorsContacted: selectedVendors.map(v => v.vendorId),
        responseCount: 0,
        status: "pending",
        platform: "telegram"
      });

      // Send messages to vendors
      await this.sendVendorMessages(selectedVendors, session, inquiryId);
    } else {
      console.log(`❌ No vendors found for ${session.material} in ${session.city}`);
    }
  }

  private async sendStandardQuotesToBuyer(chatId: number, session: any, inquiryId: string) {
    try {
      console.log(`🤖 Sending standard quotes for inquiry ${inquiryId}`);
      console.log(`🔍 DEBUG: standardQuotes Map size:`, this.standardQuotes.size);
      console.log(`🔍 DEBUG: standardQuotes content:`, Array.from(this.standardQuotes.entries()));

      // Get all vendors with standard quotes
      const vendorsWithQuotes = [];
      for (const [vendorId, quotes] of this.standardQuotes) {
        console.log(`🔍 DEBUG: Checking vendor ${vendorId}:`, quotes);
        if (quotes) {
          vendorsWithQuotes.push({ vendorId, quotes });
        }
      }

      console.log(`🔍 DEBUG: Found ${vendorsWithQuotes.length} vendors with quotes`);

      if (vendorsWithQuotes.length > 0) {
        let message = `🤖 **Auto-Generated Quotes:**\n\n`;

        vendorsWithQuotes.forEach((vendor, index) => {
          message += `**Quote ${index + 1}:**\n`;
          message += `💰 Cement: ₹${vendor.quotes.cement}/bag\n`;
          message += `🔩 TMT: ₹${vendor.quotes.tmt}/kg\n`;
          message += `📊 GST: ${vendor.quotes.gst}%\n`;
          message += `🚚 Delivery: ₹${vendor.quotes.delivery}\n\n`;
        });

        console.log(`🔍 DEBUG: Sending message:`, message);
        await this.sendMessage(chatId, message);
        console.log(`✅ Auto-quotes sent to ${chatId}`);
      } else {
        console.log(`❌ No vendors with standard quotes found`);
      }

    } catch (error) {
      console.error('Error sending standard quotes:', error);
    }
  }

  private async handleNaturalQuoteUpdate(chatId: number, text: string) {
    try {
      const aiResult = await this.aiService.extractStandardQuotes(text);

      if (aiResult.extracted && aiResult.confidence > 0.7) {
        const vendorId = chatId.toString();
        const currentQuotes = this.standardQuotes.get(vendorId) || {};

        // Update with extracted values
        const updatedQuotes = {
          cement: aiResult.data.cement_rate || currentQuotes.cement || 350,
          tmt: aiResult.data.tmt_rate || currentQuotes.tmt || 48,
          gst: aiResult.data.gst || currentQuotes.gst || 18,
          delivery: aiResult.data.delivery !== undefined ? aiResult.data.delivery : (currentQuotes.delivery || 50),
          lastUpdated: new Date()
        };

        this.standardQuotes.set(vendorId, updatedQuotes);

        // Show confirmation
        const confirmButtons = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Confirm Rates", callback_data: `std_confirm_${vendorId}` },
                { text: "✏️ Edit More", callback_data: `std_edit_${vendorId}` }
              ]
            ]
          }
        };

        await this.bot!.sendMessage(
          chatId,
          `🤖 **AI Understood:**\n\n💰 Cement: ₹${updatedQuotes.cement}/bag\n🔩 TMT: ₹${updatedQuotes.tmt}/kg\n📊 GST: ${updatedQuotes.gst}%\n🚚 Delivery: ₹${updatedQuotes.delivery}\n\n**Correct?**`,
          confirmButtons
        );

        return true;

      } else {
        await this.sendMessage(
          chatId,
          "🤔 I didn't understand completely. Try saying:\n\n• \"Cement 350, TMT 48, GST 18%, delivery 50\"\n• \"Cement rate 380 today\"\n• \"Same as yesterday\"\n• \"Update my TMT to 52\""
        );

        return false;
      }

    } catch (error) {
      console.error('Natural language processing failed:', error);
      return false;
    }
  }


  private async processVendorRegistration(chatId: number, session: any) {
    const vendorId = `VEN-${Date.now()}`;

    console.log(`🔍 DEBUG: Registering vendor with chatId: ${chatId}`);

    try {
      // Register the vendor in the database
      const vendorData = {
        vendorId,
        name: session.vendorName || session.name || 'Unknown Vendor',
        phone: session.vendorPhone || session.phone || 'No phone',
        telegramId: chatId.toString(),
        city: session.city || session.vendorCity || 'Unknown City',  // AI puts it in session.city
        materials: session.materials || [],
        status: 'active',
        registeredAt: new Date(),
        lastQuoted: null
      };

      console.log(`🔍 DEBUG: Vendor data to save:`, vendorData);

      const savedVendor = await storage.createVendor(vendorData);
      console.log(`🔍 DEBUG: Saved vendor:`, savedVendor);

      console.log(`✅ New vendor registered: ${session.vendorName} (${vendorId}) in ${session.vendorCity}`);
    } catch (error) {
      console.error('Failed to register vendor:', error);
      throw error;
    }
  }

  async handleSaleEntry(chatId: number, text: string, userSession: any) {
    try {
      console.log('🔍 DEBUG handleSaleEntry - userSession:', userSession);
      console.log('🔍 DEBUG handleSaleEntry - typeof userSession:', typeof userSession);
      const saleResult = await this.aiService.extractSaleInformation(text);

      if (saleResult.extracted && saleResult.confidence > 0.6) {
        const confirmationMessage = `📋 **Sale Entry Detected**

${this.formatSaleData(saleResult.data)}

Reply "confirm" to save this sale or "cancel" to abort.`;

        userSession.pendingSale = saleResult.data;
        userSession.step = 'sale_confirm';
        this.userSessions.set(chatId.toString(), userSession);

        await this.sendMessage(chatId, confirmationMessage);
      } else {
        await this.sendMessage(chatId, `❌ I couldn't extract complete sale information from your message.

Please provide sale details like:
"Sold 50 bags cement to ABC Company for 350 per bag in Mumbai"

Or use /sale command to start manual entry.`);
      }
    } catch (error) {
      console.error('Sale entry error:', error);
      await this.sendMessage(chatId, `❌ Error processing sale entry. Please try again.`);
    }
  }

  private formatSaleData(data: any): string {
    let formatted = "";

    if (data.sales_type) formatted += `📦 **Material:** ${data.sales_type.toUpperCase()}\n`;
    if (data.cement_company) formatted += `🏢 **Company:** ${data.cement_company}\n`;
    if (data.cement_qty) formatted += `📊 **Quantity:** ${data.cement_qty}\n`;
    if (data.cement_price) formatted += `💰 **Price:** ₹${data.cement_price} per unit\n`;
    if (data.project_location) formatted += `📍 **Location:** ${data.project_location}\n`;
    if (data.contact_number) formatted += `📞 **Contact:** ${data.contact_number}\n`;
    if (data.tmt_company) formatted += `🏢 **TMT Company:** ${data.tmt_company}\n`;
    if (data.tmt_sizes) formatted += `🔧 **TMT Sizes:** ${data.tmt_sizes}\n`;
    if (data.tmt_quantities) formatted += `📊 **TMT Quantities:** ${data.tmt_quantities}\n`;

    return formatted || "**Sale information extracted**";
  }

  private async isRegisteredVendor(chatId: number): Promise<boolean> {
    try {
      const vendor = await storage.getVendorByTelegramId(chatId.toString());
      return vendor !== null;
    } catch (error) {
      console.error('Error checking vendor registration:', error);
      return false;
    }
  }

  private async processSaleEntry(chatId: number, saleData: any) {
    try {
      const vendor = await storage.getVendorByTelegramId(chatId.toString());
      if (!vendor) {
        throw new Error('Vendor not found. Please register first.');
      }

      // Extract number from quantity strings like "50 bags" -> 50
      const extractQuantityNumber = (qtyString: string): number | null => {
        if (!qtyString) return null;
        const match = qtyString.match(/(\d+)/);
        return match ? parseInt(match[1]) : null;
      };

      const saleRecord = {
        // NOT NULL fields - must provide values
        sales_type: saleData.sales_type || 'cement',
        project_owner: saleData.project_owner || 'Unknown',
        project_name: saleData.project_name || 'Direct Sale',
        completion_time: saleData.completion_time || 0,
        contact_number: saleData.contact_number || vendor.phone || 'Not provided',

        // NULLABLE fields - can be null
        cement_company: saleData.cement_company || saleData.tmt_company || null,
        cement_qty: extractQuantityNumber(saleData.cement_qty) || null,
        cement_price: saleData.cement_price || null,
        tmt_company: saleData.tmt_company || null,
        tmt_sizes: saleData.tmt_sizes ? [saleData.tmt_sizes] : null, // ARRAY type
        tmt_prices: saleData.tmt_prices ? JSON.parse(saleData.tmt_prices) : null, // JSONB type
        project_location: saleData.project_location || vendor.city || null,
        sales_rep_name: vendor.name || null,
        session_id: `telegram_${chatId}_${Date.now()}`,
        tmt_quantities: saleData.tmt_quantities ? JSON.parse(saleData.tmt_quantities) : null, // JSONB type
        user_email: null,

        // Fields with defaults (don't need to specify)
        // recorded_at: has CURRENT_TIMESTAMP default
        // platform: has 'web' default but we'll override
        platform: 'telegram'
      };

      await storage.createSale(saleRecord);

      await storage.createNotification({
        message: `📈 New sale recorded by ${vendor.name}: ${saleData.sales_type} - ${saleData.cement_company || saleData.tmt_company}`,
        type: 'sale_entry'
      });

      console.log(`✅ Sale recorded by vendor ${vendor.name}:`, saleRecord);
    } catch (error) {
      console.error('Failed to process sale entry:', error);
      throw error;
    }
  }
  private async sendVendorMessages(vendors: any[], inquiry: any, inquiryId: string) {
    const botConfig = await storage.getBotConfig();
    let template = botConfig?.vendorRateRequestTemplate || `Hi [Vendor Name], 

New inquiry from Telegram:
- Material: [Material]
- City: [City]
- Quantity: [Quantity]
- Brand: [Brand]

Please provide your best rate including GST and delivery charges.

Reply with:
**RATE: [Price] per [Unit]**
**GST: [Percentage]%**
**DELIVERY: [Charges]**

Inquiry ID: ${inquiryId}`;

    for (const vendor of vendors) {
      const message = template
        .replace(/\[Vendor Name\]/g, vendor.name)
        .replace(/\[Material\]/g, inquiry.material)
        .replace(/\[City\]/g, inquiry.city)
        .replace(/\[Quantity\]/g, inquiry.quantity || "Not specified")
        .replace(/\[Brand\]/g, inquiry.brand || "Any");

      console.log(`📨 Sending inquiry to vendor ${vendor.name} (${vendor.phone}):`, message);

      // Send actual Telegram message to the vendor if they have a telegramId
      if (vendor.telegramId && this.bot) {
        try {
          await this.bot.sendMessage(parseInt(vendor.telegramId), `🔔 **New Price Inquiry**

${message}

🚀 **Quick Options:**
• Click button below for instant quote
• Or reply with traditional format:

**RATE: [Price] per [Unit]**
**GST: [Percentage]%**
**DELIVERY: [Charges if any]**

Inquiry ID: ${inquiryId}`, {
            reply_markup: {
              inline_keyboard: [[
                { text: "📝 Quick Quote!", callback_data: `quote_${inquiryId}` }
              ]]
            }
          });

          console.log(`✅ Telegram message sent to vendor ${vendor.name} (Chat ID: ${vendor.telegramId})`);
        } catch (error) {
          console.error(`❌ Failed to send Telegram message to vendor ${vendor.name}:`, error);
          // Fallback to logging
          console.log(`📨 Would send to vendor ${vendor.name} (${vendor.phone}):`, message);
        }
      } else {
        // Fallback for vendors without Telegram ID
        console.log(`📨 Would send to vendor ${vendor.name} (${vendor.phone}):`, message);
      }

      // Update vendor last contacted time
      await storage.updateVendor(vendor.id, {
        lastQuoted: new Date()
      });
    }
  }

  async sendMessage(chatId: number, message: string) {
    try {
      if (!this.bot) {
        throw new Error("Bot not initialized");
      }
      // Always send real messages in Telegram (it's free!)
      const result = await this.bot.sendMessage(chatId, message);
      console.log(`📨 Telegram message sent to ${chatId}`);
      return result;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isActive: this.isActive,
      platform: "telegram",
      activeSessions: this.userSessions.size,
      lastUpdate: new Date()
    };
  }
}

// Create the bot instance with empty token initially
export const telegramBot = new TelegramBotService({
  token: "" // Will be loaded when start() is called
});