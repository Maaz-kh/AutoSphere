from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from bs4 import BeautifulSoup
import csv
import re
import time
import logging
import os

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PakWheelsScraper:
    def __init__(self, base_url):
        self.base_url = base_url
        
        # Setup Chrome options
        options = webdriver.ChromeOptions()
        options.add_argument('--start-maximized')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # Initialize driver
        self.driver = webdriver.Chrome(options=options)
        self.wait = WebDriverWait(self.driver, 10)
        
        # CSV headers
        self.headers = [
            'model', 'variant', 'model_year', 'price', 'mileage', 'transmission_type',
            'registered_in', 'color', 'assembly', 'engine_capacity', 'body_type',
            'last_updated', 'ad_ref', 'exterior_features', 'interior_features',
            'safety_security_features', 'comfort_convenience_features', 'seller_comments', 'url'
        ]
        
    def parse_price(self, price_text):
        """Convert price text to numeric value"""
        try:
            price_text = price_text.replace('PKR', '').strip()
            match = re.search(r'([\d.,]+)\s*(lacs?|crores?|cr)', price_text, re.IGNORECASE)
            if match:
                number = float(match.group(1).replace(',', ''))
                unit = match.group(2).lower()
                
                if 'lac' in unit:
                    return int(number * 100000)
                elif 'crore' in unit or 'cr' in unit:
                    return int(number * 10000000)
            return None
        except Exception as e:
            logger.error(f"Error parsing price '{price_text}': {e}")
            return None
    
    def parse_mileage(self, mileage_text):
        """Extract numeric mileage from text"""
        try:
            if not mileage_text:
                return None
            # Remove commas and extract numbers
            match = re.search(r'([\d,]+)', mileage_text)
            if match:
                return int(match.group(1).replace(',', ''))
            return None
        except Exception as e:
            logger.error(f"Error parsing mileage '{mileage_text}': {e}")
            return None
    
    def parse_model_variant_year(self, title):
        """Parse model, variant, and year from title"""
        try:
            title = re.sub(r'for Sale.*', '', title, flags=re.IGNORECASE).strip()
            year_match = re.search(r'\b(20\d{2}|19\d{2})\b', title)
            model_year = year_match.group(1) if year_match else None
            title_without_year = re.sub(r'\b(20\d{2}|19\d{2})\b', '', title).strip()
            parts = title_without_year.split(None, 2)
            
            if len(parts) >= 2:
                model = f"{parts[0]} {parts[1]}"
                variant = parts[2] if len(parts) > 2 else None
            elif len(parts) == 1:
                model = parts[0]
                variant = None
            else:
                model = title_without_year
                variant = None
            
            if variant:
                variant = re.sub(r'\s+', ' ', variant).strip()
            
            return model, variant, model_year
        except Exception as e:
            logger.error(f"Error parsing title '{title}': {e}")
            return None, None, None
    
    def extract_car_details(self, main_window):
        """Extract all details from a car listing page"""
        try:
            # Wait for page to load
            time.sleep(2)
            
            # Get page source
            soup = BeautifulSoup(self.driver.page_source, 'html.parser')
            
            # Initialize data dictionary
            data = {
                'model': None,
                'variant': None,
                'model_year': None,
                'price': None,
                'mileage': None,
                'transmission_type': None,
                'registered_in': None,
                'color': None,
                'assembly': None,
                'engine_capacity': None,
                'body_type': None,
                'last_updated': None,
                'ad_ref': None,
                'exterior_features': '',
                'interior_features': '',
                'safety_security_features': '',
                'comfort_convenience_features': '',
                'seller_comments': '',
                'url': self.driver.current_url
            }
            
            # Extract title (model, variant, year)
            title_tag = soup.find('div', class_='well', id='scroll_car_info')
            if title_tag and title_tag.find('h1'):
                title = title_tag.find('h1').get_text(strip=True)
                data['model'], data['variant'], data['model_year'] = self.parse_model_variant_year(title)
            
            # Extract price
            price_box = soup.find('div', class_='price-box')
            if price_box:
                price_text = price_box.get_text(strip=True)
                data['price'] = self.parse_price(price_text)
            
            # Extract mileage and transmission from table
            info_table = soup.find('div', id='scroll_car_info')
            if info_table:
                table = info_table.find('table')
                if table:
                    rows = table.find_all('tr')
                    for row in rows:
                        cells = row.find_all('td')
                        if len(cells) >= 2:
                            # Mileage is in cell 2 (index 1)
                            mileage_p = cells[1].find('p')
                            if mileage_p:
                                mileage_text = mileage_p.get_text(strip=True)
                                data['mileage'] = self.parse_mileage(mileage_text)
                        
                        if len(cells) >= 4:
                            # Transmission is in cell 4 (index 3)
                            transmission_p = cells[3].find('p')
                            if transmission_p:
                                data['transmission_type'] = transmission_p.get_text(strip=True)
            
            # Extract car details
            detail_list = soup.find('ul', id='scroll_car_detail')
            if detail_list:
                items = detail_list.find_all('li')
                for i in range(0, len(items), 2):
                    if i + 1 < len(items):
                        key = items[i].get_text(strip=True).lower().replace(':', '')
                        value = items[i + 1].get_text(strip=True)
                        
                        if 'registered in' in key:
                            data['registered_in'] = value
                        elif 'color' in key:
                            data['color'] = value
                        elif 'assembly' in key:
                            data['assembly'] = value
                        elif 'engine capacity' in key:
                            match = re.search(r'(\d+)', value)
                            data['engine_capacity'] = match.group(1) if match else value
                        elif 'body type' in key:
                            data['body_type'] = value
                        elif 'last updated' in key:
                            data['last_updated'] = value
                        elif 'ad ref' in key:
                            data['ad_ref'] = value
            
            
            # Extract features - need to click on each category to expand
            try:
                exterior_btn = self.driver.find_element(By.XPATH, "//h3[@data-toggle='collapse' and contains(., 'Exterior')]")
                if exterior_btn:
                    self.driver.execute_script("arguments[0].click();", exterior_btn)
                    time.sleep(0.5)
            except:
                pass
            
            try:
                interior_btn = self.driver.find_element(By.XPATH, "//h3[@data-toggle='collapse' and contains(., 'Interior')]")
                if interior_btn:
                    self.driver.execute_script("arguments[0].click();", interior_btn)
                    time.sleep(0.5)
            except:
                pass
            
            try:
                safety_btn = self.driver.find_element(By.XPATH, "//h3[@data-toggle='collapse' and contains(., 'Safety')]")
                if safety_btn:
                    self.driver.execute_script("arguments[0].click();", safety_btn)
                    time.sleep(0.5)
            except:
                pass
            
            try:
                comfort_btn = self.driver.find_element(By.XPATH, "//h3[@data-toggle='collapse' and contains(., 'Comfort')]")
                if comfort_btn:
                    self.driver.execute_script("arguments[0].click();", comfort_btn)
                    time.sleep(0.5)
            except:
                pass
            
            # Re-parse page after expanding sections
            soup = BeautifulSoup(self.driver.page_source, 'html.parser')
            
            # Extract features
            features_div = soup.find('div', class_='faqs')
            if features_div:
                accordion = features_div.find('div', id='featuresAccordion')
                if accordion:
                    accordion_groups = accordion.find_all('div', class_='accordion-group')
                    
                    for group in accordion_groups:
                        heading = group.find('h3', class_='accordion-toggle')
                        if heading:
                            category = heading.get_text(strip=True).lower()
                            feature_list = group.find('ul', class_='car-feature-list')
                            if feature_list:
                                features = []
                                for li in feature_list.find_all('li'):
                                    feature_text = li.get_text(strip=True)
                                    if feature_text:
                                        features.append(feature_text)
                                
                                features_str = ';'.join(features)
                                
                                if 'exterior' in category:
                                    data['exterior_features'] = features_str
                                elif 'interior' in category:
                                    data['interior_features'] = features_str
                                elif 'safety' in category:
                                    data['safety_security_features'] = features_str
                                elif 'comfort' in category:
                                    data['comfort_convenience_features'] = features_str
            
            # Extract seller comments
            seller_heading = soup.find('h2', id='scroll_seller_comments')
            if seller_heading:
                comments_div = seller_heading.find_next_sibling('div')
                if comments_div:
                    tip_label = comments_div.find('label', class_='detail-tip')
                    if tip_label:
                        tip_label.decompose()
                    
                    comments_html = str(comments_div)
                    comments_html = comments_html.replace('<br>', ' ').replace('<br/>', ' ')
                    comments_soup = BeautifulSoup(comments_html, 'html.parser')
                    data['seller_comments'] = comments_soup.get_text(strip=True)
                        
            return data
            
        except Exception as e:
            logger.error(f"Error extracting details: {e}")
            return None
    
    def get_car_listings(self):
        """Get all car listing IDs from current page (from all ul elements)"""
        try:
            # Wait for search results to load
            self.wait.until(EC.presence_of_element_located(
                (By.CSS_SELECTOR, "ul.search-results.car-search-results")
            ))
    
            # Get all listing items from ALL ul elements
            soup = BeautifulSoup(self.driver.page_source, 'html.parser')
    
            # Find ALL ul elements with class 'search-results'
            search_results_list = soup.find_all('ul', class_='search-results')
    
            if not search_results_list:
                logger.warning("Could not find any search results ul elements")
                return []
    
            logger.info(f"Found {len(search_results_list)} ul elements on this page")
    
            car_ids = []
    
            # Iterate through each ul element
            for ul_index, search_results in enumerate(search_results_list, 1):
                # Find all li elements in this ul
                listings = search_results.find_all('li', class_='classified-listing')
        
                logger.info(f"  UL #{ul_index}: Found {len(listings)} listings")
        
                for listing in listings:
                    listing_id = listing.get('id')
                    if listing_id and listing_id.startswith('main_ad_'):
                        # Extract the numeric ID from "main_ad_10716530"
                        ad_id = listing_id.replace('main_ad_', '')
                        car_ids.append(ad_id)
                        logger.debug(f"    Added listing: {listing_id}")
    
            logger.info(f"Total listings found on this page: {len(car_ids)}")
            return car_ids
    
        except Exception as e:
            logger.error(f"Error getting car listings: {e}")
            return []
    
    def click_car_ad(self, ad_id):
        """Click on a car ad using XPath"""
        try:
            # Build XPath - try multiple possible paths
            xpaths = [
                f'//*[@id="main_ad_{ad_id}"]/div/div[2]/div[1]/div/div[1]/a',
                f'//*[@id="main_ad_{ad_id}"]//a[@class="car-name ad-detail-path"]',
                f'//*[@id="main_ad_{ad_id}"]//h3/../..'
            ]
            
            for xpath in xpaths:
                try:
                    element = self.driver.find_element(By.XPATH, xpath)
                    # Open in new tab
                    self.driver.execute_script("window.open(arguments[0].href, '_blank');", element)
                    
                    # Switch to new tab
                    self.driver.switch_to.window(self.driver.window_handles[-1])
                    return True
                except:
                    continue
            
            logger.warning(f"Could not find clickable element for ad {ad_id}")
            return False
            
        except Exception as e:
            logger.error(f"Error clicking ad {ad_id}: {e}")
            return False
    
    def has_prev_page(self):
        """Check if there's a previous page"""
        try:
            soup = BeautifulSoup(self.driver.page_source, 'html.parser')
            pagination = soup.find('ul', class_='pagination')
            if pagination:
                # Find all li elements
                all_lis = pagination.find_all('li')
                
                # The previous button is typically the second li (index 1)
                if len(all_lis) > 1:
                    prev_li = all_lis[1]
                    # Check if it has an anchor tag with href
                    prev_link = prev_li.find('a', href=True)
                    if prev_link:
                        logger.info(f"Previous page link found: {prev_link.get('href')}")
                        return True
                
                # Also check for prev_page class as backup
                prev_link = pagination.find('li', class_='prev_page')
                if prev_link and prev_link.find('a', href=True):
                    return True
            
            logger.info("No previous page found")
            return False
        except Exception as e:
            logger.error(f"Error checking for previous page: {e}")
            return False
    
    def go_to_prev_page(self):
        """Navigate to previous page"""
        try:
            # Wait a bit to ensure page is fully loaded
            time.sleep(2)
            
            # Try multiple strategies to find and click the previous button
            prev_button = None
            
            # Strategy 1: Try the full XPath provided
            xpaths = [
                '/html/body/div[6]/section[2]/div/div[3]/div[2]/div/div[2]/div[2]/div[4]/ul/li[2]/a',
                '//*[@id="main-container"]/section[2]/div/div[3]/div[2]/div/div[2]/div[2]/div[4]/ul/li[2]/a',
            ]
            
            for xpath in xpaths:
                try:
                    prev_button = self.driver.find_element(By.XPATH, xpath)
                    logger.info(f"Found prev button using XPath: {xpath}")
                    break
                except:
                    continue
            
            # Strategy 2: Find pagination ul, then get the second li
            if not prev_button:
                try:
                    pagination = self.driver.find_element(By.CSS_SELECTOR, "ul.pagination")
                    all_lis = pagination.find_elements(By.TAG_NAME, "li")
                    
                    if len(all_lis) > 1:
                        # Second li (index 1) should be the previous button
                        prev_li = all_lis[1]
                        prev_button = prev_li.find_element(By.TAG_NAME, "a")
                        logger.info("Found prev button using pagination ul strategy")
                except Exception as e:
                    logger.debug(f"Strategy 2 failed: {e}")
            
            # Strategy 3: Try CSS selector with class
            if not prev_button:
                try:
                    prev_button = self.driver.find_element(By.CSS_SELECTOR, "li.prev_page a")
                    logger.info("Found prev button using CSS selector")
                except:
                    pass
            
            if not prev_button:
                logger.error("Could not find previous button with any strategy")
                return False
            
            # Scroll button into view
            self.driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", prev_button)
            time.sleep(1)
            
            # Get the href before clicking (for debugging)
            try:
                href = prev_button.get_attribute('href')
                logger.info(f"Previous page URL: {href}")
            except:
                pass
            
            # Try to click
            try:
                prev_button.click()
                logger.info("Clicked prev button successfully")
            except:
                logger.info("Regular click failed, trying JavaScript click")
                self.driver.execute_script("arguments[0].click();", prev_button)
            
            # Wait for page to load
            time.sleep(3)
            
            # Wait for new results to load
            try:
                self.wait.until(EC.presence_of_element_located(
                    (By.CSS_SELECTOR, "ul.search-results.car-search-results")
                ))
                logger.info("Previous page loaded successfully")
                return True
            except:
                logger.error("Timeout waiting for previous page to load")
                return False
            
        except Exception as e:
            logger.error(f"Error navigating to previous page: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def initialize_csv(self, output_file):
        """Initialize CSV file with headers if it doesn't exist"""
        if not os.path.exists(output_file):
            try:
                with open(output_file, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.DictWriter(f, fieldnames=self.headers)
                    writer.writeheader()
                logger.info(f"Created new CSV file: {output_file}")
            except Exception as e:
                logger.error(f"Error initializing CSV: {e}")
    
    def append_to_csv(self, data_list, output_file):
        """Append multiple records to CSV file"""
        try:
            with open(output_file, 'a', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=self.headers)
                writer.writerows(data_list)
        except Exception as e:
            logger.error(f"Error appending to CSV: {e}")
    
    def scrape(self, output_file='pakwheels_cars.csv', max_pages=None):
        """Main scraping function - starts from last page and goes backwards"""
        page_num = 1
        total_records = 0
        
        try:
            # Initialize CSV file with headers
            self.initialize_csv(output_file)
            
            # Load last page (assuming the URL provided is the last page)
            logger.info(f"Loading last page: {self.base_url}")
            self.driver.get(self.base_url)
            time.sleep(3)
            
            main_window = self.driver.current_window_handle
            
            while True:
                if max_pages and page_num > max_pages:
                    logger.info(f"Reached max pages limit: {max_pages}")
                    break
                
                logger.info(f"Scraping page {page_num} (going backwards)")
                
                # Get all car IDs on current page
                car_ids = self.get_car_listings()
                
                if not car_ids:
                    logger.warning("No listings found on this page")
                    break
                
                # Store page data in memory
                page_data = []
                
                # Process each car on the page
                for idx, car_id in enumerate(car_ids, 1):
                    # Click on car ad (opens in new tab)
                    if self.click_car_ad(car_id):
                        # Extract details from new tab
                        car_data = self.extract_car_details(main_window)
                        
                        if car_data:
                            # Store in page data
                            page_data.append(car_data)
                            logger.info(f"Extracted record {idx}/{len(car_ids)} on page {page_num}")
                        
                        # Close current tab and switch back to main window
                        self.driver.close()
                        self.driver.switch_to.window(main_window)
                        time.sleep(1)
                    else:
                        logger.warning(f"Failed to click ad {car_id}")
                
                # After processing all cars on the page, append to CSV
                if page_data:
                    self.append_to_csv(page_data, output_file)
                    total_records += len(page_data)
                    logger.info(f"✓ Saved {len(page_data)} records from page {page_num}. Total so far: {total_records}")
                
                # Check for previous page
                if self.has_prev_page():
                    logger.info("Moving to previous page...")
                    if not self.go_to_prev_page():
                        logger.info("Could not navigate to previous page. Stopping.")
                        break
                    page_num += 1
                else:
                    logger.info("No more previous pages. Scraping complete!")
                    break
            
        except Exception as e:
            logger.error(f"Error during scraping: {e}")
        
        finally:
            self.driver.quit()
        
        logger.info(f"Scraping complete! Total records: {total_records}")
        return total_records


if __name__ == "__main__":
    # Initialize scraper with LAST PAGE URL
    # Example: If there are 500 pages, provide URL to page 500
    scraper = PakWheelsScraper("https://www.pakwheels.com/used-cars/search/-/?page=138")
    
    # Start scraping (goes backwards from last page to first)
    # total = scraper.scrape(output_file='test_cars.csv', max_pages=2)  # Test with 2 pages
    total = scraper.scrape(output_file='cultus_data-101-138.csv', max_pages=38)  # Scrape all pages
    
    print(f"\nScraping completed! Total cars scraped: {total}")
    print(f"Data saved to: used_cars_data.csv")