import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";
import { InvoiceRenderer } from "../../application/ports";
import { formatEuros, type InvoiceDocument } from "../../domain";
import type { PostalAddress } from "@meridian/contracts";

const INK = "#1d1b18";
const MUTED = "#6b665e";
const RULE = "#d9d4cb";
const day = (date: Date) => date.toISOString().slice(0, 10);
const addressLines = (address: PostalAddress) =>
  [address.fullName, address.line1, address.line2, `${address.postalCode} ${address.city}`, address.country].filter((line): line is string => Boolean(line && line.trim()));

/** A4 invoice PDF with pdfkit: seller, addresses, lines, pricing breakdown and the VAT contained in the total. */
@Injectable()
export class PdfKitInvoiceRenderer extends InvoiceRenderer {
  render(invoice: InvoiceDocument): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: { Title: `Invoice ${invoice.invoiceNumber}`, Subject: `Order ${invoice.orderNumber}`, Author: invoice.seller.name, CreationDate: invoice.issuedAt },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      doc.on("error", reject);
      try {
        draw(doc, invoice);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

function draw(doc: PDFKit.PDFDocument, invoice: InvoiceDocument) {
  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text("MERIDIAN", left, 50);
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text([invoice.seller.name, ...invoice.seller.address, `VAT ID ${invoice.seller.vatId}`, invoice.seller.email].join("\n"), left, 76);

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text("Invoice", left, 50, { width, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  const meta = [
    `Invoice number: ${invoice.invoiceNumber}`,
    `Invoice date: ${day(invoice.issuedAt)}`,
    `Order: ${invoice.orderNumber} (${day(invoice.orderDate)})`,
    invoice.paidAt ? `Paid: ${day(invoice.paidAt)}` : "Payment pending",
  ];
  doc.text(meta.join("\n"), left, 74, { width, align: "right" });

  const blockTop = 160;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text("Bill to", left, blockTop);
  doc.font("Helvetica").fontSize(9).text([...addressLines(invoice.billingAddress), invoice.customer.email].join("\n"), left, blockTop + 14, { width: width / 2 - 10 });
  doc.font("Helvetica-Bold").fontSize(10).text("Ship to", left + width / 2, blockTop);
  doc.font("Helvetica").fontSize(9).text([...addressLines(invoice.shippingAddress), `Delivery: ${invoice.shippingMethodLabel}`].join("\n"), left + width / 2, blockTop + 14, { width: width / 2 });

  // lines
  const columns = { item: left, qty: left + width * 0.58, unit: left + width * 0.68, total: left + width * 0.84 };
  let y = 280;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED);
  doc.text("Item", columns.item, y);
  doc.text("Qty", columns.qty, y, { width: 40, align: "right" });
  doc.text("Unit price", columns.unit, y, { width: 70, align: "right" });
  doc.text("Amount", columns.total, y, { width: right - columns.total, align: "right" });
  y += 16;
  doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).stroke();
  y += 8;
  doc.font("Helvetica").fillColor(INK);
  for (const line of invoice.lines) {
    if (y > doc.page.height - 200) {
      doc.addPage();
      y = 50;
    }
    const height = doc.heightOfString(line.description, { width: columns.qty - columns.item - 10 });
    doc.text(line.description, columns.item, y, { width: columns.qty - columns.item - 10 });
    doc.fillColor(MUTED).fontSize(8).text(line.sku, columns.item, y + height + 1);
    doc.fillColor(INK).fontSize(9);
    doc.text(String(line.qty), columns.qty, y, { width: 40, align: "right" });
    doc.text(formatEuros(line.unitPriceCents), columns.unit, y, { width: 70, align: "right" });
    doc.text(formatEuros(line.lineTotalCents), columns.total, y, { width: right - columns.total, align: "right" });
    y += height + 18;
  }
  doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).stroke();
  y += 10;

  // totals
  const { pricing } = invoice;
  const totals: [string, string, boolean?][] = [["Subtotal", formatEuros(pricing.subtotalCents)]];
  if (pricing.discountCents > 0) totals.push([invoice.couponCode ? `Discount (${invoice.couponCode})` : "Discount", `-${formatEuros(pricing.discountCents)}`]);
  totals.push([`Shipping (${invoice.shippingMethodLabel})`, formatEuros(pricing.shippingCents)]);
  totals.push(["Total (VAT included)", formatEuros(pricing.totalCents), true]);
  totals.push([`VAT ${pricing.taxRatePercent}% included`, formatEuros(pricing.taxCents)]);
  totals.push(["Net amount", formatEuros(invoice.netCents)]);
  for (const [label, value, strong] of totals) {
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 11 : 9).fillColor(INK);
    doc.text(label, left + width * 0.45, y, { width: width * 0.35, align: "right" });
    doc.text(value, columns.total, y, { width: right - columns.total, align: "right" });
    y += strong ? 18 : 14;
  }

  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
    `All prices in ${pricing.currency} include VAT at the destination rate. Thank you for shopping with Meridian. Questions: ${invoice.seller.email}.`,
    left,
    doc.page.height - 90,
    { width, align: "center" },
  );
}
