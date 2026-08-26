# Nginx Proxy Manager

Expose your services easily and securely.



![](https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjqbH_t7MShoKu-ecVVMO4GgV8ro-llmDGgbjSc52pQ06DvHjOPBTt_OKzu7KpKeMjSTAI_13AhouSP_uL2iFbzQB1QEwhznzPm_a9Wz5a0-BipiX4xNg7TKk3y1Cpmszdq0dz1PzBKw-QzAu4S950vwk2XHL07s7YBySIxTSCS7OicShDkFrYY-37wzZx0/s1600/nginxproxymanager-2026-08-26-22_57_06.png)



### Configuration

#### Free DNS (Subdomain) - DuckDNS

1. After logging in at [duckdns.org](https://www.duckdns.org/), obtain a domain name from the **domains** section.
2. In the panel, enter the server’s **Public IP address** into the **current ip** field.



### Nginx Proxy Manager

1. In your browser, go to **http://<Server-IP-Address>:81**.
2. To add an application:
   1. Go to the **Hosts** tab and click **Proxy Hosts**.
   2. Click the **Add Proxy Host** button.
   3. In the **Details** tab:
      - **Domain Names:** app1.myproject.duckdns.org
      - **Schema:** http
      - **Forward Hostname / IP:** The Docker container name (or IP address) of the application
      - **Forward Port:** The port on which the application is running
      - **Block Common Exploits:** Enable this option (for security)
   4. In the **SSL** tab (to enforce HTTPS):
      - From the **SSL Certificate** menu, select **Request a new Certificate**
      - Enable **Force SSL**
      - Enable **HTTP/2 Support**

Let’s Encrypt will automatically generate the SSL certificate in the background, and anyone accessing the application will be redirected to a secure HTTPS connection.

After configuring the address for the Nginx Proxy Manager UI, you can disable access to **port 81** on the server.



![](https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhS-OKtg6LO036iR4OtVR4__YwP1MVCg1Y8ptXi41xFbCNhcLZs3fCpCG2dKlTtNJ1IeoYa4Sv7-s9a-1sYA4ajPefwetOmFPoeji8KcQrMlkRmqCkd1ObNt26jRPGhEHmkKA6nE_CdFB_Vew93RYe7xKGpTGIAcQ1DwfF19AuFjt9PpIMLrFgJofQy2c4h/s1600/Screenshot_20260827001532.png)



## Resources

Website: [https://nginxproxymanager.com](https://nginxproxymanager.com/)

GitHub: [https://github.com/NginxProxyManager/nginx-proxy-manager](https://github.com/NginxProxyManager/nginx-proxy-manager)

Docker Hub (jc21): [https://hub.docker.com/r/jc21/nginx-proxy-manager](https://hub.docker.com/r/jc21/nginx-proxy-manager)