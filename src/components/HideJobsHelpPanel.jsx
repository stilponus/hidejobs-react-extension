import React, { useState, useEffect } from "react";
import { Button, Form, Input, message as antdMessage } from "antd";

export default function HideJobsHelpPanel() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Load saved values from localStorage
  useEffect(() => {
    form.setFieldsValue({
      name: localStorage.getItem("hideJobsName") || "",
      email: localStorage.getItem("hideJobsEmail") || "",
      message: localStorage.getItem("hideJobsSuggestion") || "",
    });
  }, [form]);

  // Save values to localStorage
  const handleValuesChange = (_, allValues) => {
    localStorage.setItem("hideJobsName", allValues.name || "");
    localStorage.setItem("hideJobsEmail", allValues.email || "");
    localStorage.setItem("hideJobsSuggestion", allValues.message || "");
  };

  const handleSubmit = async (values) => {
    setLoading(true);

    const templateParams = {
      message: `Name: ${values.name}\nEmail: ${values.email}\n\nSuggestion:\n${values.message}`,
      to_email: "info@hidejobs.com",
    };

    try {
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: "service_pqy11jk",
          template_id: "template_45odowf",
          user_id: "_BPMQgv8fs577zDCP",
          template_params: templateParams,
        }),
      });

      if (res.ok) {
        antdMessage.success("Your message was sent successfully.");
        setSent(true);
        form.resetFields();
        localStorage.removeItem("hideJobsName");
        localStorage.removeItem("hideJobsEmail");
        localStorage.removeItem("hideJobsSuggestion");
      } else {
        const text = await res.text();
        console.error("❌ Email send failed:", text);
        antdMessage.error("There was an issue sending your message. Please try again.");
      }
    } catch (err) {
      console.error("💥 EmailJS error:", err);
      antdMessage.error("Something went wrong. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
        <h2 className="text-lg font-semibold text-hidejobs-700">Message Sent</h2>
        <p className="text-gray-700">
          Thank you for your feedback! We’ll get back to you soon.
        </p>
        <Button type="primary" size="large" onClick={() => setSent(false)}>
          Send More
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-hidejobs-700">Help & Support</h2>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={handleValuesChange}
      >
        <Form.Item
          label="Your Name"
          name="name"
          rules={[{ required: true, message: "Please enter your name" }]}
        >
          <Input placeholder="Your name" />
        </Form.Item>

        <Form.Item
          label="Your Email"
          name="email"
          rules={[
            { required: true, message: "Please enter your email" },
            { type: "email", message: "Please enter a valid email" },
          ]}
        >
          <Input placeholder="your@email.com" />
        </Form.Item>

        <Form.Item
          label="Message"
          name="message"
          rules={[{ required: true, message: "Please enter your message" }]}
        >
          <Input.TextArea
            rows={4}
            style={{ resize: "none" }} // 🚫 disable manual resize
            placeholder="Write your message here..."
          />
        </Form.Item>

        <Form.Item>
          <Button type="primary" size="large" htmlType="submit" loading={loading}>
            Send
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
